// Verifies visible feedback timing and cancellation without a browser clipboard.
import { afterEach, it, vi } from "vitest";
import assert from "node:assert/strict";
import { createCopyFeedback } from "./copyFeedback.ts";

afterEach(() => vi.useRealTimers());

it("shows copied feedback for one second after the latest successful attempt", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let label = "Copy Markdown";
  const feedback = createCopyFeedback({
    writeText: async () => {},
    showCopied: () => {
      label = "Copied!";
    },
    resetLabel: () => {
      label = "Copy Markdown";
    },
    showFailed: () => assert.fail("Unexpected copy failure"),
  });
  await feedback.copy("first");
  assert.equal(label, "Copied!");
  vi.advanceTimersByTime(600);
  await feedback.copy("second");
  vi.advanceTimersByTime(400);
  assert.equal(label, "Copied!");
  vi.advanceTimersByTime(599);
  assert.equal(label, "Copied!");
  vi.advanceTimersByTime(1);
  assert.equal(label, "Copy Markdown");
  feedback.dispose();
});
it("ignores stale clipboard results and cancels feedback when details change", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const pending: (() => void)[] = [];
  const events: string[] = [];
  const feedback = createCopyFeedback({
    writeText: () => new Promise<void>((resolve) => pending.push(resolve)),
    showCopied: () => events.push("copied"),
    resetLabel: () => events.push("reset"),
    showFailed: () => events.push("failed"),
  });
  const first = feedback.copy("first");
  const second = feedback.copy("second");
  pending[0]();
  await first;
  assert.deepEqual(events, ["reset", "reset"]);
  pending[1]();
  await second;
  assert.equal(events.at(-1), "copied");
  feedback.dispose();
  vi.advanceTimersByTime(1000);
  assert.equal(events.at(-1), "copied");
  await feedback.copy("disposed");
  assert.equal(pending.length, 2);
});
it("shows copy failure in the button for one second without success feedback", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const events: string[] = [];
  const feedback = createCopyFeedback({
    writeText: async () => {
      throw new Error("Clipboard unavailable");
    },
    showCopied: () => events.push("copied"),
    resetLabel: () => events.push("reset"),
    showFailed: () => events.push("Copy failed"),
  });
  await feedback.copy("finding Markdown");
  assert.deepEqual(events, ["reset", "Copy failed"]);
  vi.advanceTimersByTime(999);
  assert.equal(events.at(-1), "Copy failed");
  vi.advanceTimersByTime(1);
  assert.equal(events.at(-1), "reset");
  feedback.dispose();
});
