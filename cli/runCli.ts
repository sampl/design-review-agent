// Maps local command-line inputs to core without owning review or runtime behavior.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ReviewError,
  runReview,
  reviewDefaults,
  type ReviewRequest,
} from "design-review-agent-core";

const HELP = `Design review

Run from the repository checkout with:
  pnpm --filter design-review-agent-cli review --app-url URL --source PATH --output NEW_PATH

Required:
  --app-url URL              Running HTTP(S) application
  --output PATH              New report directory; parent must exist

Optional:
  --source PATH              Source checkout (defaults to current directory)
  --route /path              Review route; repeat for more (defaults to /)
  --viewport WIDTHxHEIGHT    Viewport; repeat for more (defaults to desktop and mobile)
  --focus TEXT               Additional review instructions
  --documentation PATH      Relevant documentation; repeat for more
  --github-repository URL   GitHub repository for report handoff links
  --timeout-minutes NUMBER   Agent execution budget, 1-60 (defaults to 10)
  --help                    Show this help

Uses core's Codex CLI runtime, existing local Codex authentication, and an isolated browser.
Start the app and install the runtime/browser prerequisites before running.
Complete and incomplete reviews exit 0; failures exit 1; cancellation exits 130.
`;

type CliContext = {
  cwd: string;
  write: (message: string) => void;
  signal?: AbortSignal;
  review?: typeof runReview;
};

function viewportFrom(value: string) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match)
    throw new Error("Viewport must use WIDTHxHEIGHT, such as 1440x900.");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 1 || height < 1 || width > 10000 || height > 10000)
    throw new Error("Viewport dimensions must be between 1 and 10000.");
  return { width, height };
}

export async function runCli(
  argumentsList: string[],
  context: CliContext,
): Promise<number> {
  let outputDirectory: string | undefined;
  let evidenceDirectory: string | undefined;
  let ownsOutput = false;
  try {
    const { values } = parseArgs({
      args: argumentsList,
      allowPositionals: false,
      options: {
        "app-url": { type: "string" },
        source: { type: "string" },
        output: { type: "string" },
        route: { type: "string", multiple: true },
        viewport: { type: "string", multiple: true },
        focus: { type: "string" },
        documentation: { type: "string", multiple: true },
        "github-repository": { type: "string" },
        "timeout-minutes": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
    if (values.help) {
      context.write(HELP);
      return 0;
    }
    if (!values["app-url"]?.trim() || !values.output?.trim())
      throw new Error("Supply --app-url and --output. Use --help for usage.");
    const timeoutMinutes =
      values["timeout-minutes"] === undefined
        ? undefined
        : Number(values["timeout-minutes"]);
    if (
      timeoutMinutes !== undefined &&
      (!Number.isInteger(timeoutMinutes) ||
        timeoutMinutes < 1 ||
        timeoutMinutes > 60)
    )
      throw new Error("Timeout minutes must be an integer between 1 and 60.");
    const viewports =
      values.viewport?.map(viewportFrom) ??
      reviewDefaults.viewports.map((viewport) => ({ ...viewport }));
    outputDirectory = resolve(context.cwd, values.output);
    // Reserve a fresh destination before execution so failure diagnostics cannot overwrite an existing report.
    try {
      await mkdir(outputDirectory);
    } catch {
      throw new Error("Choose a new output directory whose parent exists.");
    }
    ownsOutput = true;
    evidenceDirectory = await mkdtemp(
      join(tmpdir(), "design-review-evidence-"),
    );
    const request: ReviewRequest = {
      appUrl: values["app-url"],
      sourceDirectory: resolve(context.cwd, values.source ?? "."),
      evidenceDirectory,
      scope: values.route ?? [...reviewDefaults.scope],
      viewports,
      ...(values.focus !== undefined ? { instructions: values.focus } : {}),
      ...(values.documentation
        ? {
            documentationPaths: values.documentation.map((path) =>
              resolve(context.cwd, path),
            ),
          }
        : {}),
      ...(values["github-repository"]
        ? { githubRepository: values["github-repository"] }
        : {}),
      ...(timeoutMinutes !== undefined
        ? { reviewTimeoutMs: timeoutMinutes * 60000 }
        : {}),
    };
    const result = await (context.review ?? runReview)(
      request,
      outputDirectory,
      context.signal ? { signal: context.signal } : {},
    );
    context.write(
      JSON.stringify({
        status: result.status,
        outputDirectory: result.outputDirectory,
        runIssues: result.runIssues,
      }),
    );
    return 0;
  } catch (error) {
    const failure =
      error instanceof ReviewError
        ? {
            code: error.code,
            message: error.message,
            runIssues: error.runIssues,
          }
        : {
            code: "cli-failed",
            message: error instanceof Error ? error.message : "Review failed.",
            runIssues: [],
          };
    const diagnostic = { status: "failed", ...failure };
    if (ownsOutput && outputDirectory) {
      try {
        await writeFile(
          join(outputDirectory, "run-status.json"),
          JSON.stringify(diagnostic, null, 2),
          { flag: "wx" },
        );
      } catch {
        context.write("Could not save the failure diagnostic.");
      }
    }
    context.write(JSON.stringify(diagnostic));
    return failure.code === "cancelled" || context.signal?.aborted ? 130 : 1;
  } finally {
    if (evidenceDirectory)
      await rm(evidenceDirectory, { recursive: true, force: true });
  }
}
