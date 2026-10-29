// Checks schema-derived types and validation result narrowing.

import assert from "node:assert/strict";
import { it } from "vitest";
import { type Report, validateReport } from "./index.ts";
import { fixtureValue, completeReport } from "./fixtures/contract.ts";

// Compile these assignments to verify that schema-derived public types retain
// their literals and discriminants rather than collapsing into broad objects.
function checkPublicTypes(report: Report) {
  const version: "0.1" = report.schemaVersion;
  const priority: "high" | "medium" | "low" = fixtureValue(
    report.issues[0],
  ).priority;
  const optionalBaseUrl: string | undefined = report.review.baseUrl;
  void optionalBaseUrl;
  const optionalGithubRepository: string | undefined =
    report.review.githubRepository;
  void optionalGithubRepository;
  const locationName: string = fixtureValue(
    fixtureValue(report.issues[0]).locations[0],
  ).name;
  const locationUrl: string = fixtureValue(
    fixtureValue(report.issues[0]).locations[0],
  ).url;
  // @ts-expect-error Locations require authored names and URLs rather than legacy strings.
  fixtureValue(report.issues[0]).locations[0] = "/settings";
  void locationName;
  void locationUrl;
  const scope = fixtureValue(report.issues[0]).scope;
  if (scope.kind === "areas") {
    const areaId: string = fixtureValue(scope.areaIds[0]);
    void areaId;
  }
  const evidence = fixtureValue(report.issues[0]).evidence;
  // @ts-expect-error Each issue requires one evidence object, not an array.
  fixtureValue(report.issues[0]).evidence = [evidence];
  if (evidence.kind === "screenshot") {
    const width: number = evidence.before.viewport.width;
    const optionalProposal: string | undefined = evidence.proposedAfter?.image;
    void width;
    void optionalProposal;
  } else {
    const method: string = evidence.method;
    void method;
    // @ts-expect-error Nonvisual evidence has no screenshot capture.
    void evidence.before;
  }
  // @ts-expect-error Unsupported versions cannot be authored as Report.
  report.schemaVersion = "2.0.0";
  // @ts-expect-error Arbitrary categories are not part of the report vocabulary.
  fixtureValue(report.issues[0]).category = "other";
  // @ts-expect-error Priority is a fixed vocabulary.
  fixtureValue(report.issues[0]).priority = "critical";
  void version;
  void priority;
}

it("narrows the public validation result", () => {
  const result = validateReport(completeReport());
  if (result.valid) {
    const report: Report = result.report;
    assert.equal(report.schemaVersion, "0.1");
  } else {
    const code: string = fixtureValue(result.errors[0]).code;
    assert.fail(code);
  }
  // Keep the compile-time test function referenced without applying intentional
  // invalid assignments to the runtime fixture.
  assert.equal(typeof checkPublicTypes, "function");
});
