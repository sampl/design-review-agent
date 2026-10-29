// Compile-time consumer contract: execution is selected internally, not by adapters.
import { fixtureValue } from "../report-format/fixtures/contract.ts";
import assert from "node:assert/strict";
import { it } from "vitest";
import {
  runReview,
  ReviewError,
  reviewDefaults,
  type ReviewRequest,
  type ReviewResult,
} from "../index.ts";
import * as core from "../index.ts";

function consumerContract(request: ReviewRequest) {
  const result: Promise<ReviewResult> = runReview(request, "/new/report", {
    signal: new AbortController().signal,
  });
  // @ts-expect-error Executors are an internal testing seam, not a consumer argument.
  runReview(request, async () => ({}), "/new/report");
  return result;
}

it("exposes the small review entry point, shared defaults, and typed failures", () => {
  assert.equal(typeof consumerContract, "function");
  assert.deepEqual(reviewDefaults.scope, ["/"]);
  assert.deepEqual(Object.keys(core).sort(), [
    "ReviewError",
    "installBrowser",
    "reviewDefaults",
    "runReview",
  ]);
  const failure = new ReviewError("timeout", "Review stopped.");
  assert.equal(failure.code, "timeout");
  assert.equal(fixtureValue(failure.runIssues[0]).severity, "error");
});
