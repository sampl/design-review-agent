// Displays finding priority with a dismissible explanation tooltip.
import type { Issue } from "../../report-format/index.ts";
import { element } from "./dom.ts";
import { createTooltipState } from "../interactions/tooltipState.ts";
export function priorityBadge(
  issue: Issue,
  tooltipHost: HTMLElement,
): { element: HTMLElement; dispose: () => void } {
  const badge = element(
    "p",
    `priority priority-explanation ${issue.priority}`,
    `${issue.priority.charAt(0).toUpperCase()}${issue.priority.slice(1)} priority`,
  );
  badge.tabIndex = 0;
  const tooltip = element(
    "div",
    "capture-tooltip priority-rationale-tooltip",
    issue.priorityRationale,
  );
  tooltip.id = "priority-rationale-tooltip";
  tooltip.hidden = true;
  tooltip.setAttribute("role", "tooltip");
  badge.setAttribute("aria-describedby", tooltip.id);
  function position(): void {
    if (tooltip.hidden) return;
    const bounds = badge.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();
    const preferredTop =
      bounds.bottom + size.height + 16 <= innerHeight
        ? bounds.bottom + 8
        : bounds.top - size.height - 8;
    tooltip.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - size.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(preferredTop, innerHeight - size.height - 8))}px`;
  }
  const state = createTooltipState({
    show: () => {
      tooltip.hidden = false;
      position();
    },
    hide: () => {
      tooltip.hidden = true;
    },
  });
  const lifecycle = new AbortController();
  const listenerOptions = { signal: lifecycle.signal };
  for (const target of [badge, tooltip]) {
    target.addEventListener(
      "mouseenter",
      () => state.hover(true),
      listenerOptions,
    );
    target.addEventListener(
      "mouseleave",
      () => state.hover(false),
      listenerOptions,
    );
  }
  badge.addEventListener("focus", () => state.focus(true), listenerOptions);
  badge.addEventListener("blur", () => state.focus(false), listenerOptions);
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        state.visible &&
        !document.querySelector(".image-modal[open], .run-details-modal[open]")
      ) {
        state.dismiss();
        event.preventDefault();
      }
    },
    listenerOptions,
  );
  window.addEventListener("resize", position, listenerOptions);
  window.addEventListener("scroll", position, {
    ...listenerOptions,
    capture: true,
  });
  tooltipHost.append(tooltip);
  function dispose(): void {
    lifecycle.abort();
    state.dispose();
    tooltip.remove();
  }
  return { element: badge, dispose };
}
