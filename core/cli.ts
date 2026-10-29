// Exposes the complete review flow, browser setup, and specialized file-based stages.
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  prepareReview,
  finalizeReview,
  defaultViewerDirectory,
  type ReviewContext,
} from "./run-review/reviewLifecycle.ts";
import { runReview, ReviewError } from "./run-review/runReview.ts";
import { packageReport } from "./report-format/packageReport.ts";
import { installBrowser } from "./codex-runtime/codexRuntime.ts";

const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: Object.fromEntries(
    [
      "request",
      "context",
      "prompt",
      "schema",
      "response",
      "output",
      "report",
      "evidence",
      "viewer",
      "responses-proxy-url",
    ].map((name) => [name, { type: "string" as const }]),
  ),
});
function required(name: string): string {
  const value = values[name];
  if (typeof value !== "string" || !value)
    throw new Error(`Missing --${name}.`);
  return value;
}
async function json(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(filename, "utf8"));
}
try {
  if (positionals[0] === "install-browser") {
    await installBrowser(controller.signal);
  } else if (positionals[0] === "run") {
    const result = await runReview(
      (await json(
        required("request"),
      )) as import("./run-review/runReview.ts").ReviewRequest,
      required("output"),
      {
        ...(values.viewer !== undefined
          ? { viewerDirectory: values.viewer }
          : {}),
        signal: controller.signal,
        ...(values["responses-proxy-url"] !== undefined
          ? { responsesProxyUrl: values["responses-proxy-url"] }
          : {}),
      },
    );
    console.info(JSON.stringify(result));
  } else if (positionals[0] === "prepare") {
    const prepared = await prepareReview(await json(required("request")));
    await writeFile(
      required("context"),
      JSON.stringify(prepared.context, null, 2),
    );
    await writeFile(required("prompt"), prepared.prompt);
    await writeFile(
      required("schema"),
      JSON.stringify(prepared.responseSchema, null, 2),
    );
  } else if (positionals[0] === "finalize") {
    const result = await finalizeReview(
      (await json(required("context"))) as ReviewContext,
      await json(required("response")),
      required("output"),
      values.viewer !== undefined ? { viewerDirectory: values.viewer } : {},
    );
    console.info(
      JSON.stringify({
        status: result.status,
        outputDirectory: result.outputDirectory,
        runIssues: result.runIssues,
      }),
    );
  } else if (positionals[0] === "package") {
    const result = await packageReport({
      report: await json(required("report")),
      evidenceDirectory: required("evidence"),
      outputDirectory: required("output"),
      viewerDirectory: values.viewer ?? (await defaultViewerDirectory()),
    });
    console.info(JSON.stringify({ outputDirectory: result.outputDirectory }));
  } else
    throw new Error(
      "Expected run, install-browser, prepare, finalize, or package command.",
    );
} catch (error) {
  console.error(
    JSON.stringify(
      error instanceof ReviewError
        ? {
            code: error.code,
            message: error.message,
            runIssues: error.runIssues,
          }
        : {
            code: "invalid-request",
            message:
              error instanceof Error ? error.message : "Design review failed.",
          },
    ),
  );
  process.exitCode =
    error instanceof ReviewError && error.code === "cancelled" ? 130 : 1;
} finally {
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
}
