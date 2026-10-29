// Verifies transition completion, repeated dismissal, and reduced-motion behavior.
import { afterEach, it, vi } from "vitest";
import assert from "node:assert/strict";
import { createModalDismissal, MODAL_TRANSITION_MS } from "./modalDismissal.ts";

afterEach(() => vi.useRealTimers());

it("finishes a modal close after its transition and ignores repeated dismissal", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const events: string[] = [];
  const dismissal = createModalDismissal({
    reducedMotion: () => false,
    beginClose: () => events.push("animate"),
    finishClose: () => events.push("close"),
  });
  dismissal.close();
  dismissal.close();
  assert.deepEqual(events, ["animate"]);
  vi.advanceTimersByTime(MODAL_TRANSITION_MS - 1);
  assert.deepEqual(events, ["animate"]);
  vi.advanceTimersByTime(1);
  assert.deepEqual(events, ["animate", "close"]);
  dismissal.close();
  assert.deepEqual(events, ["animate", "close"]);
  dismissal.dispose();
});
it("closes immediately without animation when reduced motion is preferred", () => {
  const events: string[] = [];
  const dismissal = createModalDismissal({
    reducedMotion: () => true,
    beginClose: () => events.push("animate"),
    finishClose: () => events.push("close"),
  });
  dismissal.close();
  assert.deepEqual(events, ["close"]);
  dismissal.dispose();
});
it("cancels deferred completion if the modal has already been removed", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let closed = false;
  const dismissal = createModalDismissal({
    reducedMotion: () => false,
    beginClose: () => {},
    finishClose: () => {
      closed = true;
    },
  });
  dismissal.close();
  dismissal.dispose();
  vi.advanceTimersByTime(MODAL_TRANSITION_MS);
  assert.equal(closed, false);
});
