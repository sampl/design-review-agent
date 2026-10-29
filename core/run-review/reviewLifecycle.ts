// Owns review preparation, execution, validation, and report publication.
import { readFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import Ajv from "ajv";
import {
  reportSchema,
  type Report,
  type Capture,
  validateReport,
} from "../report-format/index.ts";
import { packageReport } from "../report-format/packageReport.ts";
import { runtimeRequirements } from "../codex-runtime/codexRuntime.ts";
import { ReviewError } from "./reviewError.ts";
import { resolveAssetRoot } from "./assetRoot.ts";

export type ReviewOptions = {
  viewerDirectory?: string;
  signal?: AbortSignal;
  responsesProxyUrl?: string;
};
export const reviewDefaults = Object.freeze({
  scope: Object.freeze(["/"]),
  viewports: Object.freeze(
    runtimeRequirements.viewports.map((viewport) =>
      Object.freeze({ ...viewport }),
    ),
  ),
  reviewTimeoutMs: runtimeRequirements.reviewTimeoutMs,
});
export type ReviewResult = {
  report: Report;
  runIssues: RunIssue[];
  outputDirectory: string;
  status: "complete" | "incomplete";
};

export type ReviewRequest = {
  appUrl: string;
  sourceDirectory: string;
  scope: string[];
  instructions?: string;
  documentationPaths?: string[];
  githubRepository?: string;
  viewports: { width: number; height: number }[];
  evidenceDirectory: string;
  reviewTimeoutMs?: number;
};

export type RunIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
};

export type ReviewResponse = {
  report: Report | null;
  runIssues: RunIssue[];
  captures: Capture[];
};
export type ReviewContext = {
  version: 1;
  request: ReviewRequest;
  preparedAt: string;
};
export type PreparedReview = {
  context: ReviewContext;
  prompt: string;
  responseSchema: typeof reviewResponseSchema;
};

const requestSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "appUrl",
    "sourceDirectory",
    "scope",
    "viewports",
    "evidenceDirectory",
  ],
  properties: {
    appUrl: { type: "string", minLength: 1 },
    sourceDirectory: { type: "string", minLength: 1 },
    scope: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", pattern: "^/(?!/)[^\\\\\\s]*$" },
    },
    instructions: { type: "string" },
    documentationPaths: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    githubRepository: {
      type: "string",
      pattern: "^https://github\\.com/[^/?#\\s]+/[^/?#\\s]+$",
    },
    viewports: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["width", "height"],
        properties: {
          width: { type: "integer", minimum: 1, maximum: 10000 },
          height: { type: "integer", minimum: 1, maximum: 10000 },
        },
      },
    },
    evidenceDirectory: { type: "string", minLength: 1 },
    reviewTimeoutMs: { type: "integer", minimum: 1, maximum: 3600000 },
  },
} as const;
const { definitions, properties, required, type, additionalProperties } =
  reportSchema;

// Definitions remain at the envelope root so report-schema references keep their meaning.
export const reviewResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["report", "runIssues", "captures"],
  definitions,
  properties: {
    report: {
      anyOf: [
        { type, additionalProperties, required, properties },
        { type: "null" },
      ],
    },
    runIssues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "code", "message"],
        properties: {
          severity: { enum: ["warning", "error"] },
          code: { type: "string", pattern: "\\S" },
          message: { type: "string", pattern: "\\S" },
        },
      },
    },
    captures: { type: "array", items: { $ref: "#/definitions/capture" } },
  },
} as const;
const validator = new Ajv({
  strict: false,
  allErrors: true,
  validateFormats: false,
});
const validRequest = validator.compile<ReviewRequest>(requestSchema);
const validResponse = validator.compile<ReviewResponse>(reviewResponseSchema);

function checkedRequest(input: unknown): ReviewRequest {
  if (!validRequest(input))
    throw new Error(
      `Invalid review request: ${validator.errorsText(validRequest.errors)}`,
    );
  let url: URL;
  try {
    url = new URL(input.appUrl);
  } catch {
    throw new Error("Review app URL must be absolute HTTP(S).");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[\\\s]/.test(input.appUrl)
  )
    throw new Error("Review app URL must be HTTP(S) without credentials.");
  for (const path of [input.sourceDirectory, input.evidenceDirectory])
    if (!isAbsolute(path))
      throw new Error(
        "Review source and evidence directories must be absolute.",
      );
  return structuredClone(input);
}

export async function defaultViewerDirectory(): Promise<string> {
  const assetRoot = await resolveAssetRoot();
  const distributed = fileURLToPath(new URL("./viewer/", assetRoot));
  try {
    await access(join(distributed, "viewer.js"));
    return distributed;
  } catch {
    return fileURLToPath(new URL("./dist/viewer/", assetRoot));
  }
}

export async function prepareReview(input: unknown): Promise<PreparedReview> {
  const request = checkedRequest(input);
  const assetRoot = await resolveAssetRoot();
  // Source module names differ from the existing portable Action bundle layout.
  let reportGuidancePath = "report-format/README.md";
  try {
    await access(new URL(reportGuidancePath, assetRoot));
  } catch {
    reportGuidancePath = "report/README.md";
  }
  const guidancePaths = [
    "agent-prompt/agent-prompt.md",
    "agent-prompt/checks/README.md",
    ...definitions.category.oneOf.map(
      ({ const: category }) => `agent-prompt/checks/${category}.md`,
    ),
    reportGuidancePath,
  ];
  const guidance = await Promise.all(
    guidancePaths.map(
      async (path) =>
        `## Shared guidance: ${path}\n\n${await readFile(new URL(path, assetRoot), "utf8")}`,
    ),
  );
  await mkdir(request.evidenceDirectory, { recursive: true });
  const context: ReviewContext = {
    version: 1,
    request,
    preparedAt: new Date().toISOString(),
  };
  const template = await readFile(
    new URL("agent-prompt/review-template.md", assetRoot),
    "utf8",
  );
  const sections = {
    request: JSON.stringify(
      {
        ...request,
        reviewTimeoutMs:
          request.reviewTimeoutMs ?? runtimeRequirements.reviewTimeoutMs,
      },
      null,
      2,
    ),
    guidance: guidance.join("\n\n"),
    responseSchema: JSON.stringify(reviewResponseSchema, null, 2),
  };
  const prompt = template
    .trimEnd()
    .replace(
      /\{\{(request|guidance|responseSchema)\}\}/g,
      (_, section: keyof typeof sections) => sections[section],
    );
  return { context, prompt, responseSchema: reviewResponseSchema };
}

export async function finalizeReview(
  context: ReviewContext,
  response: unknown,
  outputDirectory: string,
  options: { viewerDirectory?: string } = {},
): Promise<ReviewResult> {
  if (
    context?.version !== 1 ||
    !Number.isFinite(Date.parse(context.preparedAt))
  )
    throw new Error("Unsupported or invalid review context.");
  const request = checkedRequest(context.request);
  if (!validResponse(response))
    throw new ReviewError(
      "invalid-response",
      "Invalid review response: expected the shared report, run issues, and capture contract.",
    );
  if (
    response.runIssues.some(({ severity }) => severity === "error") ||
    response.report === null
  )
    throw new ReviewError(
      "agent-failed",
      "Review execution failed; inspect the response run issues.",
      response.runIssues.length ? response.runIssues : undefined,
    );
  const result = validateReport(response.report);
  if (!result.valid)
    throw new Error(
      `Report validation failed: ${result.errors.map(({ path, message }) => `${path}: ${message}`).join("; ")}`,
    );
  if (
    result.report.issues.some(
      ({ evidence }) =>
        evidence.kind === "screenshot" && evidence.proposedAfter,
    )
  )
    throw new Error("Read-only reviews must not include after proposals.");
  if (result.report.review.baseUrl !== request.appUrl)
    throw new Error("Report app URL must match the supplied review URL.");
  if (
    request.githubRepository &&
    result.report.review.githubRepository !== request.githubRepository
  )
    throw new Error(
      "Report GitHub repository must match the supplied repository.",
    );
  const routePath = (route: string) =>
    new URL(route, request.appUrl).pathname.replace(/\/$/, "") || "/";
  const permittedRoutes = new Set(request.scope.map(routePath));
  if (!response.captures.length)
    throw new Error(
      "Review execution supplied no browser screenshot evidence.",
    );
  for (const issue of result.report.issues) {
    for (const location of issue.locations)
      if (!permittedRoutes.has(routePath(location.url)))
        throw new Error(
          `Reported location is outside the supplied scope: ${location.url}`,
        );
  }
  const allCaptures = [
    ...response.captures,
    ...result.report.issues.flatMap(({ evidence }) =>
      evidence.kind === "screenshot" ? [evidence.before] : [],
    ),
  ];
  for (const capture of allCaptures) {
    if (
      !capture.route.startsWith("/") ||
      capture.route.startsWith("//") ||
      !permittedRoutes.has(routePath(capture.route))
    )
      throw new Error(
        `Screenshot route is outside the supplied scope: ${capture.route}`,
      );
    if (
      !request.viewports.some(
        ({ width, height }) =>
          width === capture.viewport.width &&
          height === capture.viewport.height,
      )
    )
      throw new Error(
        "Screenshot viewport is outside the supplied review viewports.",
      );
  }
  const runIssues = structuredClone(response.runIssues);
  const report = structuredClone(result.report);
  for (const issue of runIssues)
    if (!report.review.limitations.includes(issue.message))
      report.review.limitations.push(issue.message);
  const missing = request.scope.flatMap((route) =>
    request.viewports
      .filter(
        (viewport) =>
          !response.captures.some(
            (capture) =>
              routePath(capture.route) === routePath(route) &&
              capture.viewport.width === viewport.width &&
              capture.viewport.height === viewport.height,
          ),
      )
      .map(({ width, height }) => `${route} at ${width}×${height}`),
  );
  if (missing.length) {
    const message = `No browser capture was supplied for ${missing.join(", ")}.`;
    runIssues.push({
      severity: "warning",
      code: "incomplete-capture-coverage",
      message,
    });
    report.review.limitations.push(message);
  }
  const packaged = await packageReport({
    report,
    evidenceDirectory: request.evidenceDirectory,
    outputDirectory,
    viewerDirectory:
      options.viewerDirectory ?? (await defaultViewerDirectory()),
    coverageCaptures: response.captures,
  });
  return {
    ...packaged,
    runIssues,
    status: runIssues.length ? "incomplete" : "complete",
  };
}

export async function executeReview(
  request: ReviewRequest,
  outputDirectory: string,
  options: ReviewOptions,
  executeAgent: (
    prepared: PreparedReview,
    signal: AbortSignal,
  ) => Promise<unknown>,
): Promise<ReviewResult> {
  if (options.signal?.aborted)
    throw new ReviewError("cancelled", "Design review was cancelled.");
  let prepared: PreparedReview;
  try {
    prepared = await prepareReview(request);
  } catch {
    throw new ReviewError(
      "invalid-request",
      "Review inputs or shared guidance could not be prepared.",
    );
  }
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(
      new ReviewError("cancelled", "Design review was cancelled."),
    );
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(
    () =>
      controller.abort(
        new ReviewError(
          "timeout",
          "Design review exceeded its agent execution budget.",
        ),
      ),
    request.reviewTimeoutMs ?? runtimeRequirements.reviewTimeoutMs,
  );
  try {
    // The internal executor settles after terminating its process group on abort.
    const response = await executeAgent(prepared, controller.signal);
    clearTimeout(timer);
    if (controller.signal.aborted) throw controller.signal.reason;
    // Publishing is a commit boundary: finish the portable folder once finalization begins.
    options.signal?.removeEventListener("abort", cancel);
    try {
      return await finalizeReview(
        prepared.context,
        response,
        outputDirectory,
        options,
      );
    } catch (error) {
      if (error instanceof ReviewError) throw error;
      throw new ReviewError(
        "finalization-failed",
        "Review response or evidence could not be validated and packaged.",
      );
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof ReviewError) throw error;
    throw new ReviewError(
      "agent-failed",
      "The review agent failed before completing its response.",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
