// Extends contract fixtures with realistic synthetic reports for development previews.
import { completeReport, emptyReport, warningsOnlyReport } from "./contract.ts";
import type { Report } from "../index.ts";
export const scenarios = [
  {
    id: "complete",
    title: "Complete review",
    description:
      "Five accessibility findings, single-finding and empty categories, all priorities, visual evidence, and warnings.",
  },
  {
    id: "visual",
    title: "Visual findings",
    description:
      "Before and proposed-after screenshots, nonvisual findings, and empty categories.",
  },
  {
    id: "long",
    title: "Long content",
    description: "Long titles, paragraphs, lists, and safe authored text.",
  },
  {
    id: "empty",
    title: "Empty report",
    description: "A valid report with no findings or warnings.",
  },
  {
    id: "warnings",
    title: "Warnings only",
    description:
      "Eight distinct unverified concerns for individual disclosure and Show more testing.",
  },
  {
    id: "broken-image",
    title: "Missing screenshot",
    description: "A valid report whose local screenshot file is unavailable.",
  },
  {
    id: "invalid",
    title: "Invalid report",
    description: "Validation errors with useful field paths.",
  },
  {
    id: "unsupported",
    title: "Unsupported version",
    description: "A report from a version this viewer cannot read.",
  },
  {
    id: "malformed",
    title: "Malformed JSON",
    description: "Unreadable report JSON.",
  },
  {
    id: "missing",
    title: "Missing report",
    description: "HTTP loading failure when report.json is absent.",
  },
] as const;
export type ScenarioId = (typeof scenarios)[number]["id"];
export function previewReport(id: ScenarioId): unknown {
  if (id === "empty") return emptyReport();
  if (id === "warnings") {
    const report = warningsOnlyReport();
    const additionalWarnings = [
      {
        category: "accessibility",
        areaId: "billing",
        concern: "Billing confirmation may lose keyboard focus",
        uncertainty:
          "The payment service was unavailable, so the confirmation state was not exercised.",
        nextVerification:
          "Complete a test checkout and inspect focus after confirmation.",
      },
      {
        category: "states-and-feedback",
        areaId: "settings",
        concern: "Saving may not recover after a connection failure",
        uncertainty:
          "The synthetic session did not include an interrupted network request.",
        nextVerification:
          "Interrupt a settings save, reconnect, and verify retry feedback and retained input.",
      },
      {
        category: "navigation-and-flows",
        areaId: "onboarding",
        concern: "Returning to setup may discard the selected workspace",
        uncertainty:
          "Browser back navigation was not tested after choosing a workspace.",
        nextVerification:
          "Choose a workspace, navigate forward and back, and verify the selection remains clear.",
      },
      {
        category: "content-and-imagery",
        areaId: "onboarding",
        concern: "Invitation guidance may be unclear for non-owners",
        uncertainty:
          "Only the workspace-owner role was available in this demo scenario.",
        nextVerification:
          "Open setup as a member and check the invitation instructions against the available actions.",
      },
      {
        category: "layout-and-spacing",
        areaId: "settings",
        concern: "Long workspace names may overlap account controls",
        uncertainty: "The inspected account used a short workspace name.",
        nextVerification:
          "Test a long workspace name at narrow widths and verify every account control remains visible.",
      },
      {
        category: "interactions-and-motion",
        areaId: "onboarding",
        concern: "Setup transitions may ignore reduced-motion preference",
        uncertainty: "The optional workspace-tour animation was not reached.",
        nextVerification:
          "Enable reduced motion, open the workspace tour, and inspect its transitions.",
      },
      {
        category: "color",
        areaId: "billing",
        concern: "Billing status may rely on color alone",
        uncertainty:
          "Past-due and trial-expired billing states were unavailable.",
        nextVerification:
          "Inspect both billing states and verify each status has a readable text label.",
      },
    ] as const;
    report.warnings.push(
      ...additionalWarnings.map(({ areaId, ...warning }, index) => ({
        ...warning,
        id: `warning-${index + 2}`,
        scope: { kind: "areas" as const, areaIds: [areaId] },
      })),
    );
    return report;
  }
  const report: Report = completeReport();
  report.review.title = "Workspace settings review";
  if (id !== "complete") delete report.review.githubRepository;
  report.review.scope =
    "First-time workspace setup and account settings in a synthetic collaboration app.";
  report.review.evidenceSummary =
    "Demo screenshots and synthetic keyboard observations. This is sample data, not a real product audit.";
  const titles = [
    "Account menu hides the save action",
    "Secondary text blends into the background",
    "Dense labels make settings hard to scan",
    "Related controls feel disconnected",
    "Destructive actions look like ordinary links",
    "Menu motion ignores reduced-motion preference",
    "Setup loses the path back to settings",
    "Empty workspace copy leaves the next step unclear",
    "Saving has no visible confirmation",
    "Account controls use inconsistent spacing",
  ];
  const problems = [
    "Opening the account menu covers the save button. Keyboard users cannot see the action they are about to activate.",
    "Helper text is difficult to distinguish from the panel background, especially on a dim display.",
    "Section labels and field descriptions share the same weight and size, making it harder to find the right setting.",
  ];
  report.issues.forEach((issue, index) => {
    issue.title = titles[index];
    issue.problem = problems[index % problems.length];
    issue.suggestedSolution =
      index === 0
        ? "Anchor the menu above its trigger and keep the save action visible. Preserve the existing account options and keyboard behavior."
        : "Clarify the hierarchy of the affected setting while preserving the product’s existing visual language. Verify keyboard access and both color themes.";
    issue.priorityRationale =
      index === 0
        ? "Saving settings is a frequent task. The obscured control affects keyboard users directly and was observed in the inspected state."
        : "This repeated pattern adds friction during account setup. The impact is visible in the reviewed settings flow.";
  });
  const evidence = report.issues[0].evidence;
  if (evidence.kind === "screenshot") {
    evidence.before.image = "images/settings-before.svg";
    evidence.before.imageDimensions = { width: 960, height: 680 };
    evidence.before.viewport = { width: 960, height: 680 };
    evidence.before.scroll = { x: 0, y: 0 };
    evidence.observation =
      "The open account menu overlays Save changes in the lower-right corner.";
    evidence.support =
      "The before capture shows the hidden save action; the proposed layout keeps the same content and framing.";
    evidence.proposedAfter = {
      ...structuredClone(evidence.before),
      image: "images/settings-proposal.svg",
    };
  }
  if (id === "complete") {
    const accessibilityExamples = [
      {
        id: "accessible-account-trigger",
        title: "Account menu trigger has no accessible name",
        problem:
          "The icon-only account menu trigger is announced as an unnamed button. Screen reader users cannot identify its purpose before activating it.",
        suggestedSolution:
          "Give the existing trigger the accessible name ‘Account menu’ and expose whether the menu is expanded.",
        priority: "high",
        priorityRationale:
          "The account menu is a frequent entry point to settings. Its missing name directly blocks discovery for screen reader users.",
        benefit:
          "Screen reader users can identify and open the account menu confidently.",
        acceptanceCriteria: [
          "The trigger is announced as Account menu, button.",
          "Its expanded state reflects whether the menu is open.",
        ],
        method: "Accessibility tree inspection",
        observation:
          "The account trigger has role button and an empty accessible name in the inspected accessibility tree.",
        state: "Account menu closed",
        location: "/settings: account menu trigger",
        locationName: "Account menu trigger",
      },
      {
        id: "menu-focus-return",
        title: "Closing the account menu loses keyboard focus",
        problem:
          "Pressing Escape closes the account menu but leaves focus on the page body. Keyboard users must repeat navigation to continue their task.",
        suggestedSolution:
          "Return focus to the account menu trigger when Escape dismisses the menu.",
        priority: "medium",
        priorityRationale:
          "Every keyboard dismissal interrupts navigation. The task remains possible, but repeated navigation adds avoidable effort.",
        benefit:
          "Keyboard users can dismiss the menu and continue from the same control.",
        acceptanceCriteria: [
          "Escape closes the open menu.",
          "Focus returns to the trigger and remains visibly indicated.",
        ],
        method: "Keyboard interaction",
        observation:
          "After opening the menu with Enter and dismissing it with Escape, the active element is the page body.",
        state: "Account menu dismissed with Escape",
        location: "/settings: account menu",
        locationName: "Account menu",
      },
      {
        id: "profile-error-association",
        title: "Email validation error is not associated with its field",
        problem:
          "The email error appears visually after saving an invalid value, but the input has no programmatic connection to the message. Screen reader users do not hear why saving failed.",
        suggestedSolution:
          "Associate the existing error with the email field, mark the field invalid, and announce the newly displayed error once.",
        priority: "medium",
        priorityRationale:
          "Invalid input is a recoverable state, but its missing explanation makes correction difficult for screen reader users.",
        benefit:
          "Users can understand the email error and correct it without searching the page.",
        acceptanceCriteria: [
          "The invalid email field exposes its error message to assistive technology.",
          "The error is announced when it first appears without repeated announcements on every keystroke.",
        ],
        method: "Screen reader interaction",
        observation:
          "Submitting an invalid email shows ‘Enter a valid email address’, but refocusing the input announces only its label and value.",
        state: "Invalid email submitted",
        location: "/settings: email field",
        locationName: "Email field",
      },
      {
        id: "decorative-account-icons",
        title: "Decorative menu icons repeat option labels",
        problem:
          "Decorative account menu icons are exposed as images named after their adjacent text. Each option is announced twice, adding noise to a short menu.",
        suggestedSolution:
          "Hide decorative icons from assistive technology while keeping the existing option labels accessible.",
        priority: "low",
        priorityRationale:
          "The options remain understandable and usable. Removing duplicate announcements improves clarity during a repeated task.",
        benefit: "Screen reader users hear each account option once.",
        acceptanceCriteria: [
          "Decorative icons are absent from the accessibility tree.",
          "Each menu option retains its visible text as its accessible name.",
        ],
        method: "Screen reader interaction",
        observation:
          "The first option is announced as ‘Manage account, image, Manage account, menu item’.",
        state: "Account menu open",
        location: "/settings: account menu options",
        locationName: "Account menu options",
      },
    ] as const;
    const template = report.issues[1];
    report.issues = report.issues.filter(
      (issue) => issue.category !== "consistency-and-polish",
    );
    for (const finding of accessibilityExamples) {
      report.issues.push({
        ...structuredClone(template),
        id: finding.id,
        category: "accessibility",
        scope: { kind: "areas", areaIds: ["settings"] },
        title: finding.title,
        problem: finding.problem,
        suggestedSolution: finding.suggestedSolution,
        priority: finding.priority,
        priorityRationale: finding.priorityRationale,
        benefit: finding.benefit,
        locations: [{ name: finding.locationName, url: "/settings" }],
        acceptanceCriteria: [...finding.acceptanceCriteria],
        evidence: {
          kind: "nonvisual",
          method: finding.method,
          observation: finding.observation,
          support: finding.problem,
          state: finding.state,
          location: finding.location,
        },
      });
    }
  }
  if (id === "visual") {
    report.issues = report.issues.slice(0, 2);
  }
  if (id === "long") {
    report.issues[0].title =
      "The account menu obscures a critical save action across long workspace names and repeated account settings sections";
    report.issues[0].problem = Array.from(
      { length: 8 },
      () => report.issues[0].problem,
    ).join(" ");
    report.issues[0].acceptanceCriteria = Array.from(
      { length: 12 },
      (_, index) =>
        `Scenario ${index + 1}: the save action remains visible and reachable with the keyboard, including a workspace named ${"An exceptionally long workspace name ".repeat(3)}.`,
    );
    report.issues[0].benefit +=
      ' Authored text stays literal: <script>alert("demo")</script> and <img src=x onerror=alert(1)>.';
  }
  if (id === "broken-image" && evidence.kind === "screenshot")
    evidence.before.image = "images/unavailable.svg";
  if (id === "unsupported") return { ...report, schemaVersion: "99.0" };
  if (id === "invalid")
    return {
      ...report,
      review: { ...report.review, title: "" },
      issues: [
        {
          ...report.issues[0],
          scope: { kind: "areas", areaIds: ["unknown-area"] },
        },
      ],
    };
  return report;
}
