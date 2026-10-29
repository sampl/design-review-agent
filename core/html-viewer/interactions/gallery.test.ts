// Verifies issue-local screenshot ordering, boundaries, and keyboard intent.
import { it } from "vitest";
import assert from "node:assert/strict";
import { completeReport } from "../../report-format/fixtures/contract.ts";
import { issueImages, nextImageIndex, imageKeyDirection } from "./gallery.ts";
it("collects Before then Proposed after and keeps nonvisual issues image-free", () => {
  const report = completeReport();
  const issue = report.issues[0];
  assert.equal(issue.evidence.kind, "screenshot");
  if (issue.evidence.kind !== "screenshot") return;
  issue.evidence.proposedAfter = structuredClone(issue.evidence.before);
  issue.evidence.proposedAfter.image = "images/proposed.png";
  const original = structuredClone(issue);
  assert.deepEqual(issueImages(issue), [
    { label: "Before", capture: issue.evidence.before },
    { label: "Proposed after", capture: issue.evidence.proposedAfter },
  ]);
  assert.deepEqual(issue, original);
  delete issue.evidence.proposedAfter;
  assert.deepEqual(issueImages(issue), [
    { label: "Before", capture: issue.evidence.before },
  ]);
  assert.deepEqual(issueImages(report.issues[1]), []);
});
it("stops at the first and last images in both directions", () => {
  assert.equal(nextImageIndex(1, 2, 1), 1);
  assert.equal(nextImageIndex(0, 2, -1), 0);
  assert.equal(nextImageIndex(0, 2, 1), 1);
  assert.equal(nextImageIndex(1, 2, -1), 0);
  assert.equal(nextImageIndex(0, 1, 1), 0);
  assert.equal(nextImageIndex(0, 1, -1), 0);
  assert.equal(nextImageIndex(0, 0, 1), 0);
});
it("handles unmodified Left/Right keys without hijacking other shortcuts", () => {
  const key = {
    key: "ArrowLeft",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };
  assert.equal(imageKeyDirection(key), -1);
  assert.equal(imageKeyDirection({ ...key, key: "ArrowRight" }), 1);
  assert.equal(imageKeyDirection({ ...key, key: "Escape" }), null);
  for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const)
    assert.equal(imageKeyDirection({ ...key, [modifier]: true }), null);
});
