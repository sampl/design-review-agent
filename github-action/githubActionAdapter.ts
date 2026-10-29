// Translates GitHub inputs and outputs; the bundled core owns review execution.
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ReviewRequest,
  ReviewResult,
  RunIssue,
  runReview,
} from "../core/index.ts";
import { loadBundledCore } from "./bundledCore.ts";
const { reviewDefaults } = await loadBundledCore();

type ReviewInputs = {
  appUrl: string;
  paths?: string;
  viewports?: string;
  reviewFocus?: string;
  timeoutMinutes?: string;
};
type ActionOptions = ReviewInputs & {
  repositoryDirectory: string;
  runnerTemporaryDirectory: string;
  sourceScope?: string;
  requestedArtifactDirectory?: string;
  outputsFile: string;
  proxyInformationFile: string;
  signal?: AbortSignal;
  review?: typeof runReview;
};
type ActionResult = {
  status: ReviewResult["status"] | "failed";
  runIssues: RunIssue[];
  outputDirectory: string;
};
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
function isViewport(
  value: unknown,
): value is ReviewRequest["viewports"][number] {
  return (
    isObject(value) &&
    Object.keys(value).sort().join(",") === "height,width" &&
    "width" in value &&
    typeof value.width === "number" &&
    Number.isInteger(value.width) &&
    "height" in value &&
    typeof value.height === "number" &&
    Number.isInteger(value.height) &&
    value.width >= 240 &&
    value.height >= 240 &&
    value.width <= 3840 &&
    value.height <= 3840
  );
}
function isRunIssue(value: unknown): value is RunIssue {
  return (
    isObject(value) &&
    "severity" in value &&
    (value.severity === "warning" || value.severity === "error") &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

const ACTION_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
);

export async function resolveSourceDirectory(
  repositoryDirectory: string,
  sourceScope: string,
): Promise<string> {
  if (
    !sourceScope ||
    path.isAbsolute(sourceScope) ||
    sourceScope.includes("\\") ||
    /[\r\n]/u.test(sourceScope)
  ) {
    throw new Error("source-scope must be a relative repository directory");
  }
  const segments = sourceScope.split("/");
  if (
    segments.some(
      (segment) =>
        segment === ".." ||
        segment === ".git" ||
        segment.startsWith(".env") ||
        !segment,
    )
  ) {
    throw new Error("source-scope must not contain traversal or secret paths");
  }
  // Lexical checks cannot detect a harmless-looking symlink outside the checkout.
  const repositoryPath = await realpath(repositoryDirectory);
  const sourcePath = await realpath(path.resolve(repositoryPath, sourceScope));
  const relativePath = path.relative(repositoryPath, sourcePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    relativePath
      .split(path.sep)
      .some((segment) => segment === ".git" || segment.startsWith(".env"))
  ) {
    throw new Error(
      "source-scope resolves outside the checkout or to a secret path",
    );
  }
  if (!(await stat(sourcePath)).isDirectory())
    throw new Error("source-scope must name a directory");
  return sourcePath;
}

export function parseReviewInputs({
  appUrl,
  paths = JSON.stringify(reviewDefaults.scope),
  viewports = JSON.stringify(reviewDefaults.viewports),
  reviewFocus = "",
  timeoutMinutes = String(reviewDefaults.reviewTimeoutMs / 60000),
}: ReviewInputs): Pick<
  ReviewRequest,
  "appUrl" | "scope" | "viewports" | "instructions" | "reviewTimeoutMs"
> {
  const parsedUrl = new URL(appUrl);
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.hash ||
    parsedUrl.search
  )
    throw new Error(
      "app-url must be an HTTP URL without credentials, query, or fragment",
    );
  const scope: unknown = JSON.parse(paths);
  if (
    !isUnknownArray(scope) ||
    !scope.length ||
    scope.length > 20 ||
    !scope.every(
      (route): route is string =>
        typeof route === "string" &&
        route.startsWith("/") &&
        !route.startsWith("//") &&
        !route.includes("\\") &&
        !/[\r\n]/u.test(route) &&
        new URL(route, parsedUrl).origin === parsedUrl.origin,
    )
  )
    throw new Error(
      "paths must be a JSON array of 1–20 same-origin root-relative routes",
    );
  const parsedViewports: unknown = JSON.parse(viewports);
  if (
    !isUnknownArray(parsedViewports) ||
    !parsedViewports.length ||
    parsedViewports.length > 5 ||
    !parsedViewports.every(isViewport)
  )
    throw new Error(
      "viewports must contain 1–5 width/height objects with integer sizes from 240 to 3840",
    );
  const reviewTimeoutMinutes = Number(timeoutMinutes);
  if (
    !Number.isInteger(reviewTimeoutMinutes) ||
    reviewTimeoutMinutes < 1 ||
    reviewTimeoutMinutes > 30
  )
    throw new Error("timeout-minutes must be an integer from 1 to 30");
  if (typeof reviewFocus !== "string" || reviewFocus.length > 10000)
    throw new Error(
      "review-focus must be text no longer than 10000 characters",
    );
  return {
    appUrl: parsedUrl.href,
    scope,
    viewports: parsedViewports,
    instructions: reviewFocus,
    reviewTimeoutMs: reviewTimeoutMinutes * 60000,
  };
}

async function publishOutputs(
  outputFile: string,
  values: Record<string, string>,
) {
  for (const value of Object.values(values))
    if (/[\r\n]/u.test(String(value)))
      throw new Error("Output values cannot contain newlines");
  await appendFile(
    outputFile,
    Object.entries(values)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  );
}

export async function runtimeRequirements(
  actionDirectory = ACTION_DIRECTORY,
): Promise<{ codex: string; playwrightMcp: string; playwright: string }> {
  const requirements: unknown = JSON.parse(
    await readFile(
      path.join(actionDirectory, "dist/core/runtimeRequirements.json"),
      "utf8",
    ),
  );
  const packageData: unknown = JSON.parse(
    await readFile(path.join(actionDirectory, "package.json"), "utf8"),
  );
  if (
    !isObject(requirements) ||
    !("codex" in requirements) ||
    typeof requirements.codex !== "string" ||
    !("playwrightMcp" in requirements) ||
    typeof requirements.playwrightMcp !== "string" ||
    !("playwright" in requirements) ||
    typeof requirements.playwright !== "string" ||
    !isObject(packageData) ||
    !("dependencies" in packageData) ||
    !isObject(packageData.dependencies) ||
    !("@playwright/mcp" in packageData.dependencies) ||
    !("playwright" in packageData.dependencies) ||
    packageData.dependencies["@playwright/mcp"] !==
      requirements.playwrightMcp ||
    packageData.dependencies.playwright !== requirements.playwright
  )
    throw new Error(
      "Action browser dependencies must match the bundled core runtime requirements",
    );
  return {
    codex: requirements.codex,
    playwrightMcp: requirements.playwrightMcp,
    playwright: requirements.playwright,
  };
}

export async function runDesignReviewAction({
  repositoryDirectory,
  runnerTemporaryDirectory,
  appUrl,
  paths,
  sourceScope = ".",
  viewports,
  reviewFocus,
  timeoutMinutes,
  requestedArtifactDirectory = "",
  outputsFile,
  proxyInformationFile,
  signal,
  review,
}: ActionOptions): Promise<ActionResult> {
  const reviewInputs = parseReviewInputs({
    appUrl,
    ...(paths !== undefined ? { paths } : {}),
    ...(viewports !== undefined ? { viewports } : {}),
    ...(reviewFocus !== undefined ? { reviewFocus } : {}),
    ...(timeoutMinutes !== undefined ? { timeoutMinutes } : {}),
  });
  const sourceDirectory = await resolveSourceDirectory(
    repositoryDirectory,
    sourceScope,
  );
  const temporaryDirectory = await mkdtemp(
    path.join(runnerTemporaryDirectory, "design-review-agent-"),
  );
  const artifactDirectory = requestedArtifactDirectory
    ? path.resolve(repositoryDirectory, requestedArtifactDirectory)
    : path.join(temporaryDirectory, "artifact");
  // A fresh destination prevents a failed review from publishing an older successful report.
  try {
    await stat(artifactDirectory);
    throw new Error("Artifact directory already exists");
  } catch (error) {
    if (!isObject(error) || !("code" in error) || error.code !== "ENOENT")
      throw error;
  }
  if (!(await stat(path.dirname(artifactDirectory))).isDirectory())
    throw new Error("Artifact parent must exist");
  const evidenceDirectory = path.join(temporaryDirectory, "evidence");
  const serverInformation: unknown = JSON.parse(
    await readFile(proxyInformationFile, "utf8"),
  );
  if (
    !isObject(serverInformation) ||
    !("port" in serverInformation) ||
    typeof serverInformation.port !== "number" ||
    !Number.isInteger(serverInformation.port) ||
    serverInformation.port < 1 ||
    serverInformation.port > 65535
  )
    throw new Error("Invalid Responses API proxy port");
  const responsesProxyUrl = `http://127.0.0.1:${serverInformation.port}/v1`;
  const executeReview = review ?? (await loadBundledCore()).runReview;
  let status: ActionResult["status"];
  let runIssues: RunIssue[];
  let failure: unknown;
  try {
    const result = await executeReview(
      { ...reviewInputs, sourceDirectory, evidenceDirectory },
      artifactDirectory,
      { responsesProxyUrl, ...(signal ? { signal } : {}) },
    );
    status = result.status;
    runIssues = result.runIssues;
  } catch (error) {
    failure = error;
    status = "failed";
    runIssues =
      isObject(error) &&
      "runIssues" in error &&
      isUnknownArray(error.runIssues) &&
      error.runIssues.length &&
      error.runIssues.every(isRunIssue)
        ? error.runIssues
        : [
            {
              severity: "error",
              code: "review-execution-failed",
              message:
                "Design review could not finish; inspect the runner log.",
            },
          ];
  }
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    path.join(artifactDirectory, "run-status.json"),
    JSON.stringify({ status, runIssues }, null, 2),
    { flag: "wx" },
  );
  await publishOutputs(outputsFile, {
    "design-qa-artifact-directory-path": artifactDirectory,
    "review-status": status,
  });
  if (failure) throw failure;
  return { status, runIssues, outputDirectory: artifactDirectory };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "runtime") {
    if (args.length !== 2)
      throw new Error("Expected runtime OUTPUT_FILE TEMP_DIRECTORY");
    const [outputFile, temporaryDirectory] = args as [string, string];
    const requirements = await runtimeRequirements();
    const codexHome = await mkdtemp(
      path.join(temporaryDirectory, "design-review-codex-"),
    );
    await publishOutputs(outputFile, {
      "codex-version": requirements.codex,
      "codex-home": codexHome,
    });
  } else if (command === "run") {
    if (args.length !== 11) throw new Error("Expected 11 run arguments");
    const [
      repositoryDirectory,
      runnerTemporaryDirectory,
      appUrl,
      paths,
      sourceScope,
      viewports,
      reviewFocus,
      timeoutMinutes,
      requestedArtifactDirectory,
      outputsFile,
      proxyInformationFile,
    ] = args as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    try {
      await runDesignReviewAction({
        signal: controller.signal,
        repositoryDirectory,
        runnerTemporaryDirectory,
        appUrl,
        paths,
        sourceScope,
        viewports,
        reviewFocus,
        timeoutMinutes,
        requestedArtifactDirectory,
        outputsFile,
        proxyInformationFile,
      });
    } finally {
      process.removeListener("SIGINT", abort);
      process.removeListener("SIGTERM", abort);
    }
  } else throw new Error("Expected runtime or run command");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Review failed.");
    process.exitCode =
      isObject(error) && "code" in error && error.code === "cancelled"
        ? 130
        : 1;
  });
