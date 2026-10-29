// Keeps executor substitution internal while all entry points share lifecycle semantics.
import {
  prepareReview,
  finalizeReview,
  type ReviewRequest,
  type PreparedReview,
  type ReviewResult,
  type ReviewOptions,
} from "./runReview.ts";
import { ReviewError } from "./reviewError.ts";
import { runtimeRequirements } from "../codex-runtime/codexRuntime.ts";

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
