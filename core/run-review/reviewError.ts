// Gives every automated caller the same execution failure vocabulary.
import type { RunIssue } from "./reviewLifecycle.ts";

export type ReviewErrorCode =
  | "invalid-request"
  | "runtime-unavailable"
  | "runtime-version"
  | "agent-failed"
  | "invalid-response"
  | "cancelled"
  | "timeout"
  | "finalization-failed";

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  readonly runIssues: RunIssue[];

  constructor(code: ReviewErrorCode, message: string, runIssues?: RunIssue[]) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
    this.runIssues = runIssues ?? [{ severity: "error", code, message }];
  }
}
