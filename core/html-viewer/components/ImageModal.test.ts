// Checks gallery input guards before any browser state is touched.
import assert from "node:assert/strict";
import { it } from "vitest";
import {
  completeReport,
  fixtureValue,
} from "../../report-format/fixtures/contract.ts";
import { issueImages } from "../interactions/gallery.ts";
import { showImageModal } from "./ImageModal.ts";

it("leaves an empty screenshot gallery closed without touching browser state", () => {
  let dismissed = false;
  showImageModal([], 0, () => {
    dismissed = true;
  });
  assert.equal(dismissed, false);
});

it("rejects invalid gallery indices before touching browser state", () => {
  const images = issueImages(fixtureValue(completeReport().issues[0]));
  assert.ok(images.length);
  for (const index of [-1, images.length, 0.5, NaN])
    assert.throws(
      () =>
        showImageModal(images, index, () =>
          assert.fail("Unexpected browser interaction"),
        ),
      /Invalid screenshot gallery index/,
    );
});
