// Creates synthetic reports for contract tests without using real review evidence.

import type { Report } from "../index.ts";

// Synthetic review data: these filenames describe fixtures, never real evidence.
export function completeReport(): Report {
  const categories = [
    "accessibility",
    "color",
    "typography",
    "layout-and-spacing",
    "components",
    "interactions-and-motion",
    "navigation-and-flows",
    "content-and-imagery",
    "states-and-feedback",
    "consistency-and-polish",
  ] as const;
  const before = {
    image: "images/settings-before.png",
    route: "/settings",
    viewport: { width: 1280, height: 800 },
    imageDimensions: { width: 2560, height: 1600 },
    scroll: { x: -0.5, y: 120.25 },
    state: "Account menu open",
  };
  return {
    schemaVersion: "0.1",
    review: {
      title: "Synthetic workspace review",
      baseUrl: "https://example.com",
      githubRepository: "https://github.com/example/example-app",
      reviewedAt: "2026-10-26T12:30:00-04:00",
      scope: "Workspace onboarding and account settings",
      evidenceSummary:
        "Synthetic interaction observations and screenshot metadata.",
      areas: [
        { id: "settings", name: "Account settings", reviewed: true },
        { id: "onboarding", name: "First workspace setup", reviewed: true },
        { id: "billing", name: "Billing", reviewed: false },
      ],
      limitations: ["Billing was unavailable in this synthetic scenario."],
      outstandingQuestions: [
        "Should workspace owners invite members during setup?",
      ],
    },
    issues: categories.map((category, index) => ({
      id: `issue-${index + 1}`,
      category,
      scope:
        index === 0
          ? { kind: "app-wide" }
          : { kind: "areas", areaIds: ["settings", "onboarding"] },
      title: `Review ${category} in account settings`,
      problem: "The account menu obscures the next action for keyboard users.",
      suggestedSolution: "Keep the active action visible when the menu opens.",
      priority: fixtureValue((["high", "medium", "low"] as const)[index % 3]),
      priorityRationale:
        "The repeated account task affects every keyboard user; observed directly.",
      benefit: "Users can identify and complete the next action.",
      locations: [
        { name: "Account settings", url: "/settings" },
        { name: "Onboarding", url: "/onboarding" },
      ],
      acceptanceCriteria: [
        "The focused action remains visible when either menu opens.",
      ],
      ...(index === 0
        ? {
            reproductionSteps: [
              "Open account settings.",
              "Open the account menu using the keyboard.",
            ],
          }
        : {}),
      evidence:
        index === 0
          ? {
              kind: "screenshot",
              observation: "The menu covers the active action.",
              support: "Shows the obscured action in the reviewed state.",
              before,
              proposedAfter: {
                ...structuredClone(before),
                image: "images/settings-proposal.png",
              },
            }
          : {
              kind: "nonvisual",
              observation:
                "The active action cannot be identified after opening the menu.",
              support: "Keyboard interaction demonstrates the interruption.",
              method: "Keyboard interaction",
              location: "/settings",
              state: "Account menu open",
            },
    })),
    warnings: [
      {
        id: "warning-1",
        category: "navigation-and-flows",
        scope: { kind: "areas", areaIds: ["billing"] },
        concern: "Billing may use a different return path.",
        uncertainty: "The billing service was unavailable.",
        nextVerification:
          "Open billing and verify the return path when available.",
      },
    ],
  };
}

export function emptyReport(): Report {
  const report = completeReport();
  report.review.areas = [];
  report.review.limitations = [];
  report.review.outstandingQuestions = [];
  report.issues = [];
  report.warnings = [];
  return report;
}

export function warningsOnlyReport(): Report {
  const report = completeReport();
  report.issues = [];
  return report;
}

// Fixture consumers must establish that an indexed value exists before using it.
export function fixtureValue<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Expected a value in the synthetic fixture.");
  return value;
}
