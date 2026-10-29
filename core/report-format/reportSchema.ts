// Defines the report contract and derives its TypeScript types from one schema.

import type { FromSchema, JSONSchema } from "json-schema-to-ts";

export const reportSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://directedworks.com/design-qa-tool/report/0.1",
  title: "Design QA report",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "review", "issues", "warnings"],
  properties: {
    schemaVersion: { const: "0.1" },
    review: { $ref: "#/definitions/review" },
    issues: { type: "array", items: { $ref: "#/definitions/issue" } },
    warnings: { type: "array", items: { $ref: "#/definitions/warning" } },
  },
  definitions: {
    text: { type: "string", pattern: "\\S" },
    texts: { type: "array", items: { $ref: "#/definitions/text" } },
    nonemptyTexts: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/definitions/text" },
    },
    category: {
      oneOf: [
        { const: "accessibility", title: "Accessibility" },
        { const: "color", title: "Color" },
        { const: "typography", title: "Typography" },
        { const: "layout-and-spacing", title: "Layout and spacing" },
        { const: "components", title: "Components" },
        { const: "interactions-and-motion", title: "Interactions and motion" },
        { const: "navigation-and-flows", title: "Navigation and flows" },
        { const: "content-and-imagery", title: "Content and imagery" },
        { const: "states-and-feedback", title: "States and feedback" },
        { const: "consistency-and-polish", title: "Consistency and polish" },
      ],
    },
    issueLocation: {
      type: "object",
      additionalProperties: false,
      required: ["name", "url"],
      properties: {
        name: { $ref: "#/definitions/text" },
        url: {
          type: "string",
          pattern: "^/(?!/)[^\\s\\\\\\u0000-\\u0020\\u007f]*$",
        },
      },
    },
    scope: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "areaIds"],
          properties: {
            kind: { const: "areas" },
            areaIds: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: { $ref: "#/definitions/text" },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: { kind: { const: "app-wide" } },
        },
      ],
    },
    area: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "reviewed"],
      properties: {
        id: { $ref: "#/definitions/text" },
        name: { $ref: "#/definitions/text" },
        reviewed: { type: "boolean" },
      },
    },
    review: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "reviewedAt",
        "scope",
        "evidenceSummary",
        "areas",
        "limitations",
        "outstandingQuestions",
      ],
      properties: {
        title: { $ref: "#/definitions/text" },
        reviewedAt: {
          type: "string",
          format: "date-time",
          pattern: "(?:[zZ]|[+-][0-9]{2}:[0-9]{2})$",
        },
        baseUrl: {
          type: "string",
          format: "uri",
          pattern: "^[hH][tT][tT][pP][sS]?://[^/?#]",
        },
        githubRepository: {
          type: "string",
          not: { pattern: "\\.git$" },
          pattern:
            "^https://github\\.com/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/\\.*[A-Za-z0-9_-][A-Za-z0-9_.-]*(?![\\s\\S])",
        },
        scope: { $ref: "#/definitions/text" },
        evidenceSummary: { $ref: "#/definitions/text" },
        areas: { type: "array", items: { $ref: "#/definitions/area" } },
        limitations: { $ref: "#/definitions/texts" },
        outstandingQuestions: { $ref: "#/definitions/texts" },
      },
    },
    dimensions: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height"],
      properties: {
        width: { type: "integer", minimum: 1 },
        height: { type: "integer", minimum: 1 },
      },
    },
    capture: {
      type: "object",
      additionalProperties: false,
      required: [
        "image",
        "route",
        "viewport",
        "imageDimensions",
        "scroll",
        "state",
      ],
      properties: {
        image: {
          type: "string",
          pattern:
            "^(?!/)(?![A-Za-z][A-Za-z0-9+.-]*:)(?!.*[\\\\?#\\u0000-\\u001f\\u007f])(?!.*(?:^|/)\\.\\.(?:/|$)).*\\S.*$",
          description:
            "Relative local image reference. Decoded path safety also requires report validation.",
        },
        route: { $ref: "#/definitions/text" },
        viewport: { $ref: "#/definitions/dimensions" },
        imageDimensions: { $ref: "#/definitions/dimensions" },
        scroll: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y"],
          properties: { x: { type: "number" }, y: { type: "number" } },
        },
        state: { $ref: "#/definitions/text" },
      },
    },
    evidence: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "observation", "support", "before"],
          properties: {
            kind: { const: "screenshot" },
            observation: { $ref: "#/definitions/text" },
            support: { $ref: "#/definitions/text" },
            before: { $ref: "#/definitions/capture" },
            proposedAfter: { $ref: "#/definitions/capture" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "observation",
            "support",
            "method",
            "location",
            "state",
          ],
          properties: {
            kind: { const: "nonvisual" },
            observation: { $ref: "#/definitions/text" },
            support: { $ref: "#/definitions/text" },
            method: { $ref: "#/definitions/text" },
            location: { $ref: "#/definitions/text" },
            state: { $ref: "#/definitions/text" },
          },
        },
      ],
    },
    issue: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "category",
        "scope",
        "title",
        "problem",
        "suggestedSolution",
        "priority",
        "priorityRationale",
        "benefit",
        "locations",
        "acceptanceCriteria",
        "evidence",
      ],
      properties: {
        id: { $ref: "#/definitions/text" },
        category: { $ref: "#/definitions/category" },
        scope: { $ref: "#/definitions/scope" },
        title: { $ref: "#/definitions/text" },
        problem: { $ref: "#/definitions/text" },
        suggestedSolution: { $ref: "#/definitions/text" },
        priority: { enum: ["high", "medium", "low"] },
        priorityRationale: { $ref: "#/definitions/text" },
        benefit: { $ref: "#/definitions/text" },
        locations: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/definitions/issueLocation" },
        },
        reproductionSteps: { $ref: "#/definitions/nonemptyTexts" },
        acceptanceCriteria: { $ref: "#/definitions/nonemptyTexts" },
        evidence: { $ref: "#/definitions/evidence" },
      },
    },
    warning: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "category",
        "scope",
        "concern",
        "uncertainty",
        "nextVerification",
      ],
      properties: {
        id: { $ref: "#/definitions/text" },
        category: { $ref: "#/definitions/category" },
        scope: { $ref: "#/definitions/scope" },
        concern: { $ref: "#/definitions/text" },
        uncertainty: { $ref: "#/definitions/text" },
        nextVerification: { $ref: "#/definitions/text" },
      },
    },
  },
} as const satisfies JSONSchema;

export type Report = FromSchema<typeof reportSchema>;
export type Review = Report["review"];
export type Area = Review["areas"][number];
export type Issue = Report["issues"][number];
export type IssueLocation = Issue["locations"][number];
export type Warning = Report["warnings"][number];
export type FindingScope = Issue["scope"];
export type Category = Issue["category"];
export type Priority = Issue["priority"];
export type Evidence = Issue["evidence"];
export type Capture = Extract<Evidence, { kind: "screenshot" }>["before"];
