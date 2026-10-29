// Verifies hover transfer, keyboard dismissal, and capture teardown behavior.
import { afterEach, it, vi } from "vitest";
import assert from "node:assert/strict";
import { createTooltipState } from "./tooltipState.ts";

afterEach(() => vi.useRealTimers());

it("keeps metadata visible while moving between image and tooltip", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const events: string[] = [];
  const state = createTooltipState({
    show: () => events.push("show"),
    hide: () => events.push("hide"),
  });
  state.hover(true);
  state.hover(false);
  vi.advanceTimersByTime(50);
  state.hover(true);
  vi.advanceTimersByTime(100);
  assert.deepEqual(events, ["show"]);
  state.hover(false);
  vi.advanceTimersByTime(100);
  assert.deepEqual(events, ["show", "hide"]);
  state.dispose();
});
it("shows on keyboard focus and dismisses until a new interaction without moving focus", () => {
  const events: string[] = [];
  const state = createTooltipState({
    show: () => events.push("show"),
    hide: () => events.push("hide"),
  });
  state.focus(true);
  assert.equal(state.visible, true);
  state.dismiss();
  assert.equal(state.visible, false);
  state.focus(false);
  assert.deepEqual(events, ["show", "hide"]);
  state.focus(true);
  assert.equal(state.visible, true);
  state.focus(false);
  assert.equal(state.visible, false);
  state.dispose();
});
it("cancels pending updates when a capture is removed", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const events: string[] = [];
  const state = createTooltipState({
    show: () => events.push("show"),
    hide: () => events.push("hide"),
  });
  state.hover(true);
  state.hover(false);
  state.dispose();
  vi.advanceTimersByTime(100);
  state.focus(true);
  state.hover(true);
  assert.deepEqual(events, ["show", "hide"]);
});
it("delays image hover for 500ms but keeps keyboard focus immediate", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const events: string[] = [];
  const state = createTooltipState(
    { show: () => events.push("show"), hide: () => events.push("hide") },
    { hoverDelayMs: 500 },
  );
  state.hover(true);
  vi.advanceTimersByTime(499);
  assert.deepEqual(events, []);
  vi.advanceTimersByTime(1);
  assert.deepEqual(events, ["show"]);
  state.dismiss();
  state.focus(true);
  assert.equal(state.visible, true);
  state.dispose();
});
it("cancels delayed image hover on departure, blur, dismissal, or disposal", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  for (const cancel of ["leave", "blur", "dismiss", "dispose"] as const) {
    const events: string[] = [];
    const state = createTooltipState(
      { show: () => events.push("show"), hide: () => events.push("hide") },
      { hoverDelayMs: 500 },
    );
    state.hover(true);
    vi.advanceTimersByTime(250);
    if (cancel === "leave") state.hover(false);
    else if (cancel === "blur") state.focus(false);
    else state[cancel]();
    vi.advanceTimersByTime(1000);
    assert.deepEqual(events, [], cancel);
    state.dispose();
  }
});
it("keeps a delayed image tooltip visible during pointer transfer without another delay", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const events: string[] = [];
  const state = createTooltipState(
    { show: () => events.push("show"), hide: () => events.push("hide") },
    { hoverDelayMs: 500 },
  );
  state.hover(true);
  vi.advanceTimersByTime(500);
  state.hover(false);
  vi.advanceTimersByTime(50);
  state.hover(true);
  vi.advanceTimersByTime(100);
  assert.deepEqual(events, ["show"]);
  state.dispose();
});
