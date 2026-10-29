// Keeps development scenarios aligned with the shared validation boundary.
import { fixtureValue } from "../../report-format/fixtures/contract.ts";
import { it } from "vitest";
import assert from "node:assert/strict";
import { validateReport } from "../../report-format/index.ts";
import {
  scenarios,
  previewReport,
} from "../../report-format/fixtures/scenarios.ts";
for (const scenario of scenarios) {
  if (scenario.id === "missing" || scenario.id === "malformed") continue;
  it(`validates the ${scenario.id} preview scenario through the report contract`, () => {
    const result = validateReport(previewReport(scenario.id));
    assert.equal(
      result.valid,
      scenario.id !== "invalid" && scenario.id !== "unsupported",
    );
    if (!result.valid && scenario.id === "unsupported")
      assert.ok(
        result.errors.some((error) => error.code === "unsupported-version"),
      );
    if (!result.valid && scenario.id === "invalid")
      assert.ok(result.errors.some((error) => error.path === "/review/title"));
  });
}

it("provides five distinct accessibility findings alongside single and empty categories", () => {
  const result = validateReport(previewReport("complete"));
  if (!result.valid) throw new Error("Expected valid complete preview");
  const accessibility = result.report.issues.filter(
    (issue) => issue.category === "accessibility",
  );
  assert.equal(accessibility.length, 5);
  assert.equal(new Set(accessibility.map((issue) => issue.title)).size, 5);
  assert.equal(
    result.report.issues.filter((issue) => issue.category === "color").length,
    1,
  );
  assert.equal(
    result.report.issues.filter(
      (issue) => issue.category === "consistency-and-polish",
    ).length,
    0,
  );
  assert.deepEqual(
    new Set(accessibility.map((issue) => issue.priority)),
    new Set(["high", "medium", "low"]),
  );
});

it("provides eight distinct investigation warnings without verified findings", () => {
  const result = validateReport(previewReport("warnings"));
  if (!result.valid) throw new Error("Expected valid warnings preview");
  assert.equal(result.report.issues.length, 0);
  assert.equal(result.report.warnings.length, 8);
  assert.equal(
    new Set(result.report.warnings.map((warning) => warning.concern)).size,
    8,
  );
});

it("keeps visual and nonvisual evidence on separate findings in the visual preview", () => {
  const result = validateReport(previewReport("visual"));
  if (!result.valid) throw new Error("Expected valid visual preview");
  assert.equal(
    fixtureValue(result.report.issues[0]).evidence.kind,
    "screenshot",
  );
  assert.equal(
    fixtureValue(result.report.issues[1]).evidence.kind,
    "nonvisual",
  );
});

it("previews GitHub actions only when a repository is authored", () => {
  const complete = validateReport(previewReport("complete"));
  const visual = validateReport(previewReport("visual"));
  if (!complete.valid || !visual.valid)
    throw new Error("Expected valid previews");
  assert.equal(
    complete.report.review.githubRepository,
    "https://github.com/example/example-app",
  );
  assert.equal(visual.report.review.githubRepository, undefined);
});
