// Validates report structure, references, and evidence without changing input.

import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import {
  reportSchema,
  type Report,
  type Capture,
  type FindingScope,
} from "./reportSchema.ts";

export type ReportValidationError = {
  path: string;
  code:
    | "schema"
    | "unsupported-version"
    | "duplicate-id"
    | "invalid-reference"
    | "inconsistent-evidence";
  message: string;
};

export type ReportValidationResult =
  | { valid: true; report: Report }
  | { valid: false; errors: ReportValidationError[] };

const schemaValidator = new Ajv({
  allErrors: true,
  strict: true,
  ownProperties: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
addFormats(schemaValidator, { mode: "full" });
const validateSchema = schemaValidator.compile<Report>(reportSchema);

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function schemaError(error: ErrorObject): ReportValidationError {
  let path = error.instancePath;
  if (error.keyword === "required")
    path += `/${pointerSegment(error.params.missingProperty)}`;
  if (error.keyword === "additionalProperties")
    path += `/${pointerSegment(error.params.additionalProperty)}`;
  return {
    path,
    code:
      path === "/schemaVersion" && error.keyword === "const"
        ? "unsupported-version"
        : "schema",
    message:
      error.keyword === "additionalProperties"
        ? "Unknown field."
        : (error.message ?? "Invalid report field."),
  };
}

function orderedErrors(
  errors: ReportValidationError[],
): ReportValidationError[] {
  return errors.sort((left, right) => {
    for (const field of ["path", "code", "message"] as const) {
      if (left[field] < right[field]) return -1;
      if (left[field] > right[field]) return 1;
    }
    return 0;
  });
}

export function safeImageReference(image: string): boolean {
  let decodedImage: string;
  try {
    decodedImage = decodeURIComponent(image);
  } catch {
    return false;
  }
  for (;;) {
    const interpretedImage = decodedImage.trim();
    if (
      interpretedImage.startsWith("/") ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(interpretedImage) ||
      /[\\?#\u0000-\u001f\u007f]/.test(decodedImage) ||
      interpretedImage.split("/").includes("..")
    )
      return false;
    // Decode remaining escapes even beside a literal percent, so one filename
    // character cannot hide another layer of encoded traversal or URL syntax.
    const nextDecodedImage = decodedImage.replace(
      /%([0-9a-f]{2})/gi,
      (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
    );
    if (nextDecodedImage === decodedImage) return true;
    decodedImage = nextDecodedImage;
  }
}

function checkCapture(
  capture: Capture,
  path: string,
  errors: ReportValidationError[],
): void {
  if (!safeImageReference(capture.image)) {
    errors.push({
      path: `${path}/image`,
      code: "schema",
      message: "Image must reference a safe relative local path.",
    });
  }
}

function checkScope(
  scope: FindingScope,
  path: string,
  areaIds: Set<string>,
  errors: ReportValidationError[],
): void {
  if (scope.kind !== "areas") return;
  scope.areaIds.forEach((areaId, index) => {
    if (!areaIds.has(areaId)) {
      errors.push({
        path: `${path}/areaIds/${index}`,
        code: "invalid-reference",
        message: "Area reference does not identify a defined area.",
      });
    }
  });
}

export function validateReport(value: unknown): ReportValidationResult {
  if (!validateSchema(value)) {
    return {
      valid: false,
      errors: orderedErrors((validateSchema.errors ?? []).map(schemaError)),
    };
  }
  const errors: ReportValidationError[] = [];
  if (value.review.baseUrl !== undefined) {
    let validBase = false;
    try {
      const url = new URL(value.review.baseUrl);
      validBase =
        ["http:", "https:"].includes(url.protocol) &&
        !!url.hostname &&
        !url.username &&
        !url.password &&
        !/[\\\u0000-\u0020\u007f]/.test(value.review.baseUrl);
    } catch {
      // The shared boundary reports invalid app context rather than guessing an origin.
    }
    if (!validBase)
      errors.push({
        path: "/review/baseUrl",
        code: "schema",
        message:
          "App base URL must be an absolute HTTP(S) URL without credentials.",
      });
  }
  const areaIds = new Set<string>();
  value.review.areas.forEach((area, index) => {
    if (areaIds.has(area.id)) {
      errors.push({
        path: `/review/areas/${index}/id`,
        code: "duplicate-id",
        message: "Area ID must be unique.",
      });
    }
    areaIds.add(area.id);
  });
  const findingIds = new Set<string>();
  for (const collection of ["issues", "warnings"] as const) {
    value[collection].forEach((finding, index) => {
      const path = `/${collection}/${index}`;
      if (findingIds.has(finding.id)) {
        errors.push({
          path: `${path}/id`,
          code: "duplicate-id",
          message: "Issue and warning IDs must be unique across findings.",
        });
      }
      findingIds.add(finding.id);
      checkScope(finding.scope, `${path}/scope`, areaIds, errors);
    });
  }
  value.issues.forEach((issue, issueIndex) => {
    const evidence = issue.evidence;
    if (evidence.kind !== "screenshot") return;
    const path = `/issues/${issueIndex}/evidence`;
    checkCapture(evidence.before, `${path}/before`, errors);
    if (!evidence.proposedAfter) return;
    checkCapture(evidence.proposedAfter, `${path}/proposedAfter`, errors);
    const before = evidence.before;
    const proposedAfter = evidence.proposedAfter;
    const metadataPairs = [
      ["route", before.route, proposedAfter.route],
      ["state", before.state, proposedAfter.state],
      ["viewport/width", before.viewport.width, proposedAfter.viewport.width],
      [
        "viewport/height",
        before.viewport.height,
        proposedAfter.viewport.height,
      ],
      [
        "imageDimensions/width",
        before.imageDimensions.width,
        proposedAfter.imageDimensions.width,
      ],
      [
        "imageDimensions/height",
        before.imageDimensions.height,
        proposedAfter.imageDimensions.height,
      ],
      ["scroll/x", before.scroll.x, proposedAfter.scroll.x],
      ["scroll/y", before.scroll.y, proposedAfter.scroll.y],
    ] as const;
    for (const [field, originalValue, proposedValue] of metadataPairs) {
      if (originalValue !== proposedValue) {
        errors.push({
          path: `${path}/proposedAfter/${field}`,
          code: "inconsistent-evidence",
          message: "Proposal metadata must match the original capture.",
        });
      }
    }
  });
  return errors.length > 0
    ? { valid: false, errors: orderedErrors(errors) }
    : { valid: true, report: value };
}
