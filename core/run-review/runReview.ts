// Selects the production runtime while the internal lifecycle owns the review.
import { executeCodex } from "../codex-runtime/codexRuntime.ts";
import {
  executeReview,
  type ReviewRequest,
  type ReviewOptions,
  type ReviewResult,
} from "./reviewLifecycle.ts";

export { reviewDefaults } from "./reviewLifecycle.ts";
export type {
  ReviewRequest,
  ReviewOptions,
  ReviewResult,
  RunIssue,
} from "./reviewLifecycle.ts";
export { ReviewError } from "./reviewError.ts";
export type { ReviewErrorCode } from "./reviewError.ts";

export async function runReview(
  request: ReviewRequest,
  outputDirectory: string,
  options: ReviewOptions = {},
): Promise<ReviewResult> {
  return await executeReview(
    request,
    outputDirectory,
    options,
    (prepared, signal) =>
      executeCodex(prepared, signal, options.responsesProxyUrl),
  );
}
