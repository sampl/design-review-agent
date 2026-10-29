// Exposes the report schema, derived types, and validator as the public module API.

export { reportSchema } from "./reportSchema.ts";
export type {
  Report,
  Review,
  Area,
  Issue,
  IssueLocation,
  Warning,
  FindingScope,
  Category,
  Priority,
  Evidence,
  Capture,
} from "./reportSchema.ts";
export { validateReport } from "./validateReport.ts";
export type {
  ReportValidationResult,
  ReportValidationError,
} from "./validateReport.ts";
