// Verifies observable filtering, summaries, and complete handoff behavior.
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
  fixtureValue,
  completeReport,
} from "../report-format/fixtures/contract.ts";
import {
  reviewedAtLabel,
  visibleIssues,
  findingMarkdown,
  findingLinearUrl,
  findingGithubUrl,
  warningDisclosure,
  locationTarget,
  priorityDistribution,
  priorityDonutSegments,
} from "./model.ts";
describe("viewer model", () => {
  it("formats the scan date and time in the reader's local timezone and locale", () => {
    const timestamp = new Date(2026, 9, 26, 12, 30, 45).toISOString();
    assert.equal(
      reviewedAtLabel(timestamp, "en-US"),
      "Oct 26, 2026 · 12:30 PM",
    );
    assert.equal(reviewedAtLabel(timestamp, "en-GB"), "26 Oct 2026 · 12:30");
  });

  it("omits the GitHub destination when the report has no repository", () => {
    const report = completeReport();
    delete report.review.githubRepository;
    assert.equal(
      findingGithubUrl(report, fixtureValue(report.issues[0])),
      null,
    );
  });

  it("prefills the authored GitHub repository with the exact title and full Markdown", () => {
    const report = completeReport();
    const issue = fixtureValue(report.issues[0]);
    issue.title = "Fix A+B & café / 日本語? #1";
    issue.problem = "Preserve 100% width & line breaks\n?body=other#fragment";
    const original = structuredClone(report);
    const destination = new URL(findingGithubUrl(report, issue)!);
    assert.equal(destination.origin, "https://github.com");
    assert.equal(destination.pathname, "/example/example-app/issues/new");
    assert.equal(destination.hash, "");
    assert.deepEqual([...destination.searchParams.keys()], ["title", "body"]);
    assert.equal(destination.searchParams.get("title"), issue.title);
    assert.equal(
      destination.searchParams.get("body"),
      findingMarkdown(report, issue),
    );
    assert.ok(
      !destination.searchParams.get("body")?.includes("settings-before.png"),
    );
    assert.deepEqual(report, original);
  });

  it("keeps long nonvisual evidence intact in GitHub issue descriptions", () => {
    const report = completeReport();
    report.review.githubRepository = "https://github.com/Example-Org/.github";
    const issue = fixtureValue(report.issues[1]);
    issue.problem = "Long finding. ".repeat(500);
    const destination = new URL(findingGithubUrl(report, issue)!);
    assert.equal(destination.pathname, "/Example-Org/.github/issues/new");
    const body = destination.searchParams.get("body");
    assert.equal(body, findingMarkdown(report, issue));
    assert.ok(body?.includes("Keyboard interaction"));
    assert.ok(body.includes(issue.problem));
  });

  it("prefills Linear with the exact title and complete Markdown without leaking query delimiters", () => {
    const report = completeReport();
    const issue = fixtureValue(report.issues[0]);
    issue.title = "Fix search & filters + café / 日本語? #1";
    issue.problem =
      "Use A+B, 100% width & preserve\nnew lines? priority=urgent#details";
    const original = structuredClone(report);
    const destination = new URL(findingLinearUrl(report, issue));
    assert.equal(destination.origin, "https://linear.new");
    assert.equal(destination.pathname, "/");
    assert.equal(destination.hash, "");
    assert.deepEqual(
      [...destination.searchParams.keys()],
      ["title", "description"],
    );
    assert.equal(destination.searchParams.get("title"), issue.title);
    assert.equal(
      destination.searchParams.get("description"),
      findingMarkdown(report, issue),
    );
    assert.deepEqual(report, original);
  });

  it("preserves nonvisual evidence and long content in the Linear description", () => {
    const report = completeReport();
    const issue = fixtureValue(report.issues[1]);
    issue.problem = "Long finding description. ".repeat(500);
    const destination = new URL(findingLinearUrl(report, issue));
    const description = destination.searchParams.get("description");
    assert.equal(description, findingMarkdown(report, issue));
    assert.ok(description?.includes("Keyboard interaction"));
    assert.ok(description.includes(issue.problem));
  });

  it("counts priorities and gives proportional contiguous donut segments without changing findings", () => {
    const report = completeReport();
    const original = structuredClone(report);
    assert.deepEqual(priorityDistribution(report), [
      { priority: "high", count: 4, percentage: 40, offset: 0 },
      { priority: "medium", count: 3, percentage: 30, offset: 40 },
      { priority: "low", count: 3, percentage: 30, offset: 70 },
    ]);
    assert.deepEqual(report, original);
  });

  it("keeps every priority in empty and single-priority distributions", () => {
    const report = completeReport();
    report.issues = [];
    assert.deepEqual(priorityDistribution(report), [
      { priority: "high", count: 0, percentage: 0, offset: 0 },
      { priority: "medium", count: 0, percentage: 0, offset: 0 },
      { priority: "low", count: 0, percentage: 0, offset: 0 },
    ]);
    report.issues = completeReport().issues.filter(
      (issue) => issue.priority === "medium",
    );
    assert.deepEqual(priorityDistribution(report), [
      { priority: "high", count: 0, percentage: 0, offset: 0 },
      { priority: "medium", count: 3, percentage: 100, offset: 0 },
      { priority: "low", count: 0, percentage: 0, offset: 100 },
    ]);
  });

  it("draws exact proportional slices with shared boundaries and priority counts", () => {
    const report = completeReport();
    report.issues = [
      fixtureValue(report.issues[0]),
      fixtureValue(report.issues[1]),
      fixtureValue(report.issues[2]),
      fixtureValue(report.issues[2]),
    ];
    const segments = priorityDonutSegments(report);
    assert.deepEqual(
      segments.map(({ percentage, offset, label }) => ({
        percentage,
        offset,
        label,
      })),
      [
        { percentage: 25, offset: 0, label: "High priority · 1 issue" },
        { percentage: 25, offset: 25, label: "Medium priority · 1 issue" },
        { percentage: 50, offset: 50, label: "Low priority · 2 issues" },
      ],
    );
    const coordinates = (path: string) =>
      [...path.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)].map(([value]) =>
        Number(value),
      );
    const expected = [
      [44, 3, 41, 41, 0, 0, 1, 85, 44, 71, 44, 27, 27, 0, 0, 0, 44, 17],
      [85, 44, 41, 41, 0, 0, 1, 44, 85, 44, 71, 27, 27, 0, 0, 0, 71, 44],
      [44, 85, 41, 41, 0, 0, 1, 44, 3, 44, 17, 27, 27, 0, 0, 0, 44, 71],
    ];
    segments.forEach((segment, segmentIndex) => {
      const actual = coordinates(segment.path);
      assert.equal(actual.length, fixtureValue(expected[segmentIndex]).length);
      actual.forEach((value, index) => {
        assert.ok(
          Math.abs(
            value - fixtureValue(fixtureValue(expected[segmentIndex])[index]),
          ) < 1e-10,
        );
      });
    });
  });

  it("keeps empty rings empty and single-priority rings whole without a radial seam", () => {
    const report = completeReport();
    report.issues = [];
    assert.ok(priorityDonutSegments(report).every(({ path }) => path === ""));
    report.issues = [fixtureValue(completeReport().issues[1])];
    const segments = priorityDonutSegments(report);
    assert.equal(fixtureValue(segments[1]).percentage, 100);
    assert.equal(fixtureValue(segments[1]).offset, 0);
    assert.equal(fixtureValue(segments[1]).label, "Medium priority · 1 issue");
    assert.equal(
      (fixtureValue(segments[1]).path.match(/ A /g) ?? []).length,
      4,
    );
    assert.equal((fixtureValue(segments[1]).path.match(/ Z/g) ?? []).length, 2);
    assert.ok(!fixtureValue(segments[1]).path.includes(" L "));
    assert.equal(fixtureValue(segments[0]).path, "");
    assert.equal(fixtureValue(segments[2]).path, "");
  });

  it("preserves tiny and majority slices at their full data proportions", () => {
    const report = completeReport();
    report.issues = [
      ...Array.from({ length: 9999 }, () => ({
        ...fixtureValue(report.issues[0]),
      })),
      fixtureValue(report.issues[1]),
    ];
    const segments = priorityDonutSegments(report);
    assert.equal(fixtureValue(segments[0]).count, 9999);
    assert.equal(fixtureValue(segments[1]).count, 1);
    assert.equal(fixtureValue(segments[1]).percentage, 0.01);
    assert.equal(
      fixtureValue(segments[1]).offset,
      fixtureValue(segments[0]).percentage,
    );
    assert.ok(fixtureValue(segments[0]).path.includes("A 41 41 0 1 1"));
    assert.ok(fixtureValue(segments[0]).path.includes("A 27 27 0 1 0"));
    assert.ok(fixtureValue(segments[1]).path.includes("A 41 41 0 0 1"));
    assert.equal(fixtureValue(segments[2]).path, "");
    assert.ok(segments.every(({ path }) => !/NaN|Infinity/.test(path)));
  });

  it("sorts by priority stably and combines category and text search without changing input", () => {
    const report = completeReport();
    const original = structuredClone(report);
    const issues = visibleIssues(report, {
      category: "all",
      query: "",
    });
    assert.deepEqual(
      issues.map((issue) => issue.id),
      [
        "issue-1",
        "issue-4",
        "issue-7",
        "issue-10",
        "issue-2",
        "issue-5",
        "issue-8",
        "issue-3",
        "issue-6",
        "issue-9",
      ],
    );
    assert.equal(
      visibleIssues(report, {
        category: "accessibility",
        query: " APP-WIDE ",
      }).length,
      1,
    );
    assert.equal(
      visibleIssues(report, { category: "color", query: "no matching phrase" })
        .length,
      0,
    );
    assert.equal(
      visibleIssues(report, { category: "color", query: "" }).length,
      1,
    );
    assert.equal(
      visibleIssues(report, { category: "accessibility", query: " ISSUE-1 " })
        .length,
      1,
    );
    assert.equal(
      visibleIssues(report, { category: "accessibility", query: "/onboarding" })
        .length,
      1,
    );
    assert.equal(
      visibleIssues(report, { category: "accessibility", query: "Onboarding" })
        .length,
      1,
    );
    assert.deepEqual(report, original);
  });
  it("resolves only root-relative app routes against authored app context", () => {
    assert.equal(
      locationTarget("/settings?tab=profile#name", "https://example.com/app/"),
      "https://example.com/settings?tab=profile#name",
    );
    for (const reference of [
      "/settings",
      "src/Settings.tsx",
      "Settings screen",
    ])
      assert.equal(locationTarget(reference), null);
    for (const reference of [
      "src/Settings.tsx",
      "https://example.org/help",
      "HTTP://localhost:3000/settings",
      "/settings with spaces",
      "/settings\n",
      "/settings\u00a0profile",
      "settings",
      "//other.example/settings",
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/settings",
      "https://user:password@example.org",
      "https:///example.org",
      "https://example.org/\nsettings",
      "/\\other.example/settings",
      " https://example.org",
    ])
      assert.equal(
        locationTarget(reference, "https://example.com"),
        null,
        reference,
      );
    assert.equal(locationTarget("/settings", "javascript:alert(1)"), null);
  });
  it("preserves unresolved app routes as plain Markdown", () => {
    const report = completeReport();
    delete report.review.baseUrl;
    const markdown = findingMarkdown(report, fixtureValue(report.issues[0]));
    assert.ok(markdown.includes("Account settings — /settings"));
    assert.ok(!markdown.includes("App base URL:"));
  });
  it("previews three warnings and reveals the exact remaining collection without mutation", () => {
    const template = fixtureValue(completeReport().warnings[0]);
    for (const count of [0, 1, 3, 8]) {
      const warnings = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(template),
        id: `warning-${index}`,
      }));
      const original = structuredClone(warnings);
      const collapsed = warningDisclosure(warnings);
      assert.deepEqual(collapsed.warnings, warnings.slice(0, 3));
      assert.equal(collapsed.remaining, Math.max(0, count - 3));
      assert.deepEqual(warningDisclosure(warnings, true), {
        warnings,
        remaining: 0,
      });
      assert.deepEqual(warnings, original);
    }
  });
  it("copies textual visual and nonvisual evidence and finding details as inert Markdown", () => {
    const report = completeReport();
    const issue = fixtureValue(report.issues[0]);
    const markdown = findingMarkdown(report, issue);
    for (const text of [
      issue.title,
      issue.problem,
      issue.suggestedSolution,
      issue.benefit,
      issue.priorityRationale,
      ...issue.locations.flatMap((location) => [location.name, location.url]),
      ...issue.acceptanceCriteria,
      ...issue.reproductionSteps!,
      "App-wide",
      "Accessibility",
      "1280 × 800",
      "2560 × 1600",
      "-0.5, 120.25",
    ])
      assert.ok(markdown.includes(text), text);
    assert.ok(
      markdown.includes(
        `Priority: High\nPriority explanation: ${issue.priorityRationale}`,
      ),
    );
    assert.ok(markdown.includes("## To reproduce\n"));
    assert.ok(
      markdown.includes(
        "[Account settings](<https://example.com/settings>) — /settings",
      ),
    );
    assert.ok(markdown.includes("App base URL: https://example.com"));
    assert.ok(!markdown.includes("## Priority rationale"));
    assert.ok(!markdown.includes("## Reproduction steps"));
    assert.ok(
      findingMarkdown(report, fixtureValue(report.issues[1])).includes(
        "Keyboard interaction",
      ),
    );
    issue.title = "<script>alert(1)</script>";
    assert.ok(findingMarkdown(report, issue).includes("\\<script\\>"));
  });
  it("searches the single evidence object and exports an unnumbered evidence section", () => {
    const report = completeReport();
    const visual = fixtureValue(report.issues[0]).evidence;
    const nonvisual = fixtureValue(report.issues[1]).evidence;
    visual.observation = "Distinct visual observation";
    nonvisual.support = "Distinct nonvisual support";
    assert.equal(
      fixtureValue(
        visibleIssues(report, {
          category: "accessibility",
          query: visual.observation,
        })[0],
      )?.id,
      fixtureValue(report.issues[0]).id,
    );
    assert.equal(
      fixtureValue(
        visibleIssues(report, {
          category: "color",
          query: nonvisual.support,
        })[0],
      )?.id,
      fixtureValue(report.issues[1]).id,
    );
    for (const issue of report.issues.slice(0, 2)) {
      const markdown = findingMarkdown(report, issue);
      assert.ok(markdown.includes("## Evidence\n"));
      assert.ok(!markdown.includes("## Evidence 1"));
      assert.ok(markdown.includes(issue.evidence.observation));
      assert.ok(markdown.includes(issue.evidence.support));
    }
  });
  it("mirrors the finding page section order and secondary headings for both evidence kinds", () => {
    const report = completeReport();
    for (const issue of report.issues.slice(0, 2)) {
      const markdown = findingMarkdown(report, issue);
      const evidenceHeading =
        issue.evidence.kind === "screenshot"
          ? "### Visual evidence"
          : `### ${issue.evidence.method}`;
      assert.deepEqual(markdown.match(/^#{2,} .+$/gm), [
        "## Evidence",
        evidenceHeading,
        "#### What this supports",
        "## Locations",
        ...(issue.reproductionSteps ? ["## To reproduce"] : []),
        "## Suggested solution",
        "### Expected benefit",
        "### Acceptance criteria",
      ]);
      assert.ok(
        markdown.indexOf(issue.problem) < markdown.indexOf("## Evidence"),
      );
      assert.ok(
        markdown.indexOf("Priority:") < markdown.indexOf(issue.problem),
      );
      assert.ok(
        markdown.indexOf(issue.priorityRationale) <
          markdown.indexOf(issue.problem),
      );
      assert.ok(markdown.indexOf("Scope:") < markdown.indexOf(issue.problem));
      if (report.review.baseUrl)
        assert.ok(
          markdown.indexOf("App base URL:") < markdown.indexOf(issue.problem),
        );
      assert.ok(
        markdown.indexOf(issue.evidence.observation) <
          markdown.indexOf("#### What this supports"),
      );
      assert.ok(
        markdown.includes(
          `#### What this supports\n\n${issue.evidence.support}`,
        ),
      );
      if (issue.evidence.kind === "nonvisual") {
        assert.ok(markdown.includes(`Location: ${issue.evidence.location}`));
        assert.ok(markdown.includes(`State: ${issue.evidence.state}`));
      }
    }
  });
  it("omits screenshot images and file references from Markdown, Linear, and GitHub handoffs", () => {
    const report = completeReport();
    const original = structuredClone(report);
    for (const issue of report.issues.slice(0, 2)) {
      const handoffs = [
        findingMarkdown(report, issue),
        new URL(findingLinearUrl(report, issue)).searchParams.get(
          "description",
        )!,
        new URL(findingGithubUrl(report, issue)!).searchParams.get("body")!,
      ];
      for (const content of handoffs) {
        assert.ok(!content.includes("!["));
        assert.ok(!content.includes("Image:"));
        assert.ok(!content.includes("Proposed after"));
        assert.ok(content.includes(issue.evidence.observation));
        assert.ok(content.includes(issue.evidence.support));
        if (issue.evidence.kind === "screenshot") {
          assert.ok(!content.includes(issue.evidence.before.image));
          if (issue.evidence.proposedAfter)
            assert.ok(!content.includes(issue.evidence.proposedAfter.image));
          assert.ok(content.includes(`Route: ${issue.evidence.before.route}`));
          assert.ok(content.includes(`State: ${issue.evidence.before.state}`));
        }
      }
    }
    assert.deepEqual(report, original);
  });
});
