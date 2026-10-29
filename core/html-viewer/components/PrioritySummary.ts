// Summarizes finding priorities with a counted legend and accessible chart tooltips.
import type { Report } from "../../report-format/index.ts";
import { element } from "./dom.ts";
import { priorityDonutSegments } from "../model.ts";
import { createTooltipState } from "../interactions/tooltipState.ts";
export function createPrioritySummary(report: Report): {
  element: HTMLElement;
  dispose: () => void;
} {
  const priorityTooltipCleanups: (() => void)[] = [];
  const counts = element("div", "priority-summary");
  counts.setAttribute("aria-label", "Finding priorities");
  const distribution = element("div", "priority-distribution");
  const chartContainer = element("div", "priority-chart");
  const chart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chart.classList.add("priority-donut");
  chart.setAttribute("viewBox", "0 0 88 88");
  chart.setAttribute("width", "88");
  chart.setAttribute("height", "88");
  chart.setAttribute("role", "group");
  chart.setAttribute("aria-label", "Finding priority distribution");
  function ring(className: string): SVGCircleElement {
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    circle.setAttribute("cx", "44");
    circle.setAttribute("cy", "44");
    circle.setAttribute("r", "34");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke-width", "14");
    circle.setAttribute("pathLength", "100");
    circle.setAttribute("class", className);
    return circle;
  }
  const track = ring("priority-donut-track");
  track.setAttribute("aria-hidden", "true");
  if (report.issues.length === 0) chart.append(track);
  chartContainer.append(chart);
  const legend = element("ul", "priority-legend");
  const priorityTooltipStates: ReturnType<typeof createTooltipState>[] = [];
  for (const segment of priorityDonutSegments(report)) {
    if (segment.count > 0) {
      const arc = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      arc.setAttribute("class", `priority-segment ${segment.priority}`);
      arc.setAttribute("d", segment.path);
      arc.setAttribute("fill-rule", "evenodd");
      arc.setAttribute("tabindex", "0");
      arc.setAttribute("role", "img");
      arc.setAttribute("aria-label", segment.label);
      const tooltip = element("div", "priority-tooltip", segment.label);
      tooltip.setAttribute("role", "tooltip");
      tooltip.hidden = true;
      const state = createTooltipState({
        show: () => {
          // Pointer and keyboard focus can land on different slices.
          priorityTooltipStates.forEach((other) => {
            if (other !== state) other.dismiss();
          });
          tooltip.hidden = false;
        },
        hide: () => {
          tooltip.hidden = true;
        },
      });
      priorityTooltipStates.push(state);
      const lifecycle = new AbortController();
      arc.addEventListener("mouseenter", () => state.hover(true));
      arc.addEventListener("mouseleave", () => state.hover(false));
      arc.addEventListener("focus", () => state.focus(true));
      arc.addEventListener("blur", () => state.focus(false));
      tooltip.addEventListener("mouseenter", () => state.hover(true));
      tooltip.addEventListener("mouseleave", () => state.hover(false));
      document.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Escape" &&
            state.visible &&
            !document.querySelector("dialog:modal")
          ) {
            state.dismiss();
            event.preventDefault();
          }
        },
        { signal: lifecycle.signal },
      );
      priorityTooltipCleanups.push(() => {
        state.dispose();
        lifecycle.abort();
      });
      chart.append(arc);
      chartContainer.append(tooltip);
    }
    const item = element("li");
    const swatch = element("span", `priority-swatch ${segment.priority}`);
    swatch.setAttribute("aria-hidden", "true");
    item.append(
      swatch,
      element(
        "span",
        "",
        `${segment.priority.charAt(0).toUpperCase()}${segment.priority.slice(1)} priority`,
      ),
      element("span", "priority-count", String(segment.count)),
    );
    legend.append(item);
  }
  distribution.append(chartContainer, legend);
  counts.append(distribution);
  return {
    element: counts,
    dispose: () => {
      priorityTooltipCleanups.splice(0).forEach((cleanup) => cleanup());
    },
  };
}
