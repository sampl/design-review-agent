// Tests shared review preparation and failure handling without model or browser calls.
import { fixtureValue } from "../report-format/fixtures/contract.ts";
import assert from "node:assert/strict";
import { afterAll, beforeAll, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  completeReport,
  emptyReport,
} from "../report-format/fixtures/contract.ts";
import {
  prepareReview,
  executeReview,
  finalizeReview,
  type ReviewRequest,
} from "./reviewLifecycle.ts";
import { ReviewError } from "./reviewError.ts";
import { buildViewer } from "../build-scripts/buildViewer.ts";

let root: string;
let viewerDirectory: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "design-qa-run-"));
  viewerDirectory = join(root, "viewer");
  await buildViewer(viewerDirectory);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function request(): Promise<ReviewRequest> {
  const evidenceDirectory = await mkdtemp(join(root, "evidence-"));
  await writeFile(
    join(evidenceDirectory, "capture.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  return {
    appUrl: "http://localhost:4321",
    sourceDirectory: root,
    evidenceDirectory,
    scope: ["/", "/services/", "/resources/"],
    viewports: [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ],
    instructions: "Inspect mobile navigation and one request dialog.",
  };
}
function response() {
  const report = emptyReport();
  report.review.baseUrl = "http://localhost:4321";
  return {
    report,
    runIssues: [],
    captures: ["/", "/services/", "/resources/"].flatMap((route) =>
      [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ].map((viewport) => ({
        image: "capture.png",
        route,
        viewport,
        imageDimensions: { width: 1, height: 1 },
        scroll: { x: 0, y: 0 },
        state: "Synthetic runtime test",
      })),
    ),
  };
}

it("prepares one shared rubric, response contract, and explicit read-only execution boundaries", async () => {
  const input = await request();
  const prepared = await prepareReview(input);
  assert.deepEqual(prepared.context.request, input);
  assert.ok(prepared.prompt.includes(input.instructions!));
  for (const category of [
    "Accessibility",
    "Typography",
    "Navigation and flows",
  ])
    assert.ok(prepared.prompt.includes(category));
  assert.match(prepared.prompt, /inspect actual screenshot images/);
  assert.match(prepared.prompt, /Do not modify source/);
  assert.match(prepared.prompt, /Do not read environment variables/);
  assert.match(prepared.prompt, /delegating source inspection/);
  assert.ok("definitions" in prepared.responseSchema);
});

it("packages valid output with warnings without inventing report fields", async () => {
  const prepared = await prepareReview(await request());
  const result = await finalizeReview(
    prepared.context,
    {
      ...response(),
      runIssues: [
        {
          severity: "warning",
          code: "partial-coverage",
          message: "Mobile interaction not inspected.",
        },
      ],
    },
    join(root, "warning-report"),
    { viewerDirectory },
  );
  assert.equal(result.status, "incomplete");
  assert.equal(result.runIssues.length, 1);
  assert.equal("runIssues" in result.report, false);
  assert.ok(
    (
      await readFile(join(result.outputDirectory, "index.html"), "utf8")
    ).includes("design-qa-report"),
  );
});

for (const invalid of [
  null,
  {},
  { report: null, runIssues: [] },
  {
    ...response(),
    runIssues: [
      {
        severity: "error",
        code: "browser-failed",
        message: "Browser unavailable.",
      },
    ],
  },
  { ...response(), unexpected: true },
]) {
  it(`rejects unsuccessful execution ${JSON.stringify(invalid).slice(0, 60)}`, async () => {
    const prepared = await prepareReview(await request());
    const output = join(prepared.context.request.evidenceDirectory, "report");
    await assert.rejects(
      finalizeReview(prepared.context, invalid, output, { viewerDirectory }),
    );
    await assert.rejects(readFile(join(output, "index.html")));
  });
}

it("rejects mismatched app attribution and invalid report metadata", async () => {
  const prepared = await prepareReview(await request());
  const result = response();
  result.report.review.baseUrl = "https://other.example.com";
  await assert.rejects(
    finalizeReview(prepared.context, result, join(root, "wrong-app")),
    /match/,
  );
  result.report.review.baseUrl = prepared.context.request.appUrl;
  result.report.review.reviewedAt = "invalid-date";
  await assert.rejects(
    finalizeReview(prepared.context, result, join(root, "invalid-date")),
    /Invalid review response|validation/,
  );
});

it("rejects reported pages and screenshot viewports outside the configured scope", async () => {
  const prepared = await prepareReview(await request());
  const report = completeReport();
  report.review.baseUrl = prepared.context.request.appUrl;
  report.issues = [fixtureValue(report.issues[0])];
  const evidence = fixtureValue(report.issues[0]).evidence;
  if (evidence.kind !== "screenshot")
    throw new Error("Expected screenshot fixture");
  delete evidence.proposedAfter;
  await assert.rejects(
    finalizeReview(
      prepared.context,
      { ...response(), report },
      join(root, "outside-scope"),
    ),
    /outside the supplied scope/,
  );
  fixtureValue(report.issues[0]).locations = [{ name: "Home", url: "/" }];
  evidence.before.route = "/";
  await assert.rejects(
    finalizeReview(
      prepared.context,
      { ...response(), report },
      join(root, "outside-viewport"),
    ),
    /viewport/,
  );
});

it("runs a supplied harness and packages only its validated final response", async () => {
  const input = await request();
  const output = join(root, "successful-run");
  const result = await executeReview(
    input,
    output,
    { viewerDirectory },
    async (prepared, signal) => {
      assert.deepEqual(prepared.context.request.scope, input.scope);
      assert.equal(signal.aborted, false);
      return response();
    },
  );
  assert.equal(result.status, "complete");
});

it("requires browser evidence even when a report contains no findings", async () => {
  const prepared = await prepareReview(await request());
  const result = response();
  result.captures = [];
  await assert.rejects(
    finalizeReview(prepared.context, result, join(root, "no-browser"), {
      viewerDirectory,
    }),
    /no browser screenshot/,
  );
});

it("marks missing route and viewport captures incomplete and packages the receipt separately", async () => {
  const prepared = await prepareReview(await request());
  const result = response();
  result.captures = result.captures.slice(0, 1);
  const finalized = await finalizeReview(
    prepared.context,
    result,
    join(root, "partial-browser"),
    { viewerDirectory },
  );
  assert.equal(finalized.status, "incomplete");
  assert.equal(finalized.report.issues.length, 0);
  assert.match(fixtureValue(finalized.runIssues[0]).message, /services/);
  assert.ok(
    finalized.report.review.limitations.includes(
      fixtureValue(finalized.runIssues[0]).message,
    ),
  );
  const receipt = JSON.parse(
    await readFile(
      join(finalized.outputDirectory, "run-evidence.json"),
      "utf8",
    ),
  );
  assert.equal(receipt.captures.length, 1);
  assert.match(receipt.captures[0].image, /^images\/[a-f0-9]+\.png$/);
  assert.equal("captures" in finalized.report, false);
});

it("rejects an out-of-scope coverage capture before packaging", async () => {
  const prepared = await prepareReview(await request());
  const result = response();
  fixtureValue(result.captures[0]).route = "/contact/";
  await assert.rejects(
    finalizeReview(prepared.context, result, join(root, "outside-capture"), {
      viewerDirectory,
    }),
    /outside the supplied scope/,
  );
});

it("aborts a timed-out harness and does not publish a misleading empty report", async () => {
  const input = { ...(await request()), reviewTimeoutMs: 5 };
  let signal: AbortSignal | undefined;
  const output = join(root, "timeout-report");
  await assert.rejects(
    executeReview(
      input,
      output,
      { viewerDirectory },
      async (_, suppliedSignal) => {
        signal = suppliedSignal;
        return new Promise((_, reject) =>
          suppliedSignal.addEventListener(
            "abort",
            () => reject(suppliedSignal.reason),
            { once: true },
          ),
        );
      },
    ),
    /budget/,
  );
  assert.equal(signal?.aborted, true);
  await assert.rejects(readFile(join(output, "index.html")));
});

it("rejects unsafe request URLs, invalid scope, and relative source paths", async () => {
  const input = await request();
  for (const change of [
    { appUrl: "file:///tmp/app" },
    { appUrl: "https://user:secret@example.com" },
    { scope: ["https://example.com"] },
    { sourceDirectory: "relative" },
    { viewports: [{ width: 0, height: 800 }] },
  ])
    await assert.rejects(prepareReview({ ...input, ...change }));
  await mkdir(join(root, "unused"));
});

it("rejects caller cancellation before launching an agent or publishing output", async () => {
  const controller = new AbortController();
  controller.abort();
  let started = false;
  const output = join(root, "cancelled-before-start");
  await assert.rejects(
    executeReview(
      await request(),
      output,
      { signal: controller.signal },
      async () => {
        started = true;
        return response();
      },
    ),
    (error: unknown) =>
      error instanceof ReviewError && error.code === "cancelled",
  );
  assert.equal(started, false);
  await assert.rejects(readFile(join(output, "index.html")));
});

it("preserves agent-reported execution failures as typed run issues", async () => {
  const runIssues = [
    {
      severity: "error" as const,
      code: "browser-unavailable",
      message: "Browser could not inspect the app.",
    },
  ];
  await assert.rejects(
    executeReview(
      await request(),
      join(root, "agent-failed"),
      {},
      async () => ({ report: null, runIssues, captures: [] }),
    ),
    (error: unknown) =>
      error instanceof ReviewError &&
      error.code === "agent-failed" &&
      fixtureValue(error.runIssues[0]).code === "browser-unavailable",
  );
});

it("honors cancellation before finalization without publishing a report", async () => {
  const controller = new AbortController();
  const output = join(root, "cancelled-before-finalization");
  await assert.rejects(
    executeReview(
      await request(),
      output,
      { signal: controller.signal, viewerDirectory },
      async () => {
        controller.abort();
        return response();
      },
    ),
    (error: unknown) =>
      error instanceof ReviewError && error.code === "cancelled",
  );
  await assert.rejects(readFile(join(output, "index.html")));
});

it("finishes atomic publication when cancellation arrives during finalization", async () => {
  const controller = new AbortController();
  const output = join(root, "finished-publication");
  const result = await executeReview(
    await request(),
    output,
    { signal: controller.signal, viewerDirectory },
    async () => {
      setImmediate(() => controller.abort());
      return response();
    },
  );
  assert.equal(controller.signal.aborted, true);
  assert.equal(result.status, "complete");
  assert.match(
    await readFile(join(output, "index.html"), "utf8"),
    /design-qa-report/,
  );
});
