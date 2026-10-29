// Displays synthetic or captured evidence with metadata and an enlargement action.
import type { Capture } from "../../report-format/index.ts";
import { element, button } from "./dom.ts";
import { createTooltipState } from "../interactions/tooltipState.ts";
let captureTooltipId = 0;
export function screenshot(
  capture: Capture,
  label: string,
  tooltipHost: HTMLElement,
  openImage: () => void,
): { element: HTMLElement; dismissTooltip: () => void; dispose: () => void } {
  const figure = element("figure", "capture");
  const caption = element("figcaption", "", label);
  const image = element("img");
  image.src = capture.image;
  image.alt = `${label}: ${capture.state}`;
  image.loading = "lazy";
  const tooltip = element("div", "capture-tooltip");
  tooltip.id = `capture-tooltip-${++captureTooltipId}`;
  tooltip.hidden = true;
  tooltip.setAttribute("role", "tooltip");
  tooltip.append(element("p", "capture-tooltip-title", "Capture details"));
  const metadata = element("dl");
  const fields = [
    ["Route", capture.route],
    ["State", capture.state],
    ["Viewport", `${capture.viewport.width} × ${capture.viewport.height}`],
    [
      "Image dimensions",
      `${capture.imageDimensions.width} × ${capture.imageDimensions.height}`,
    ],
    ["Scroll", `${capture.scroll.x}, ${capture.scroll.y}`],
  ];
  for (const [key, value] of fields)
    metadata.append(element("dt", "", key), element("dd", "", value));
  tooltip.append(metadata);
  const enlarge = button(
    "",
    () => {
      state.dismiss();
      openImage();
    },
    "image-button",
  );
  enlarge.setAttribute(
    "aria-label",
    `Enlarge ${label.toLowerCase()} screenshot`,
  );
  enlarge.setAttribute("aria-describedby", tooltip.id);
  enlarge.append(image);
  let anchor: HTMLElement = enlarge;
  function position(): void {
    if (tooltip.hidden) return;
    const bounds = anchor.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();
    const preferredTop =
      bounds.top >= size.height + 16
        ? bounds.top - size.height - 8
        : bounds.bottom + 8;
    tooltip.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - size.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(preferredTop, innerHeight - size.height - 8))}px`;
  }
  const state = createTooltipState(
    {
      show: () => {
        tooltip.hidden = false;
        position();
      },
      hide: () => {
        tooltip.hidden = true;
      },
    },
    { hoverDelayMs: 500 },
  );
  const dismiss = () => state.dismiss();
  const lifecycle = new AbortController();
  const listenerOptions = { signal: lifecycle.signal };
  function bind(target: HTMLElement): void {
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
    target.addEventListener("focus", () => state.focus(true), listenerOptions);
    target.addEventListener("blur", () => state.focus(false), listenerOptions);
  }
  bind(enlarge);
  tooltip.addEventListener(
    "mouseenter",
    () => state.hover(true),
    listenerOptions,
  );
  tooltip.addEventListener(
    "mouseleave",
    () => state.hover(false),
    listenerOptions,
  );
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
        event.stopPropagation();
      }
    },
    listenerOptions,
  );
  window.addEventListener("resize", position, listenerOptions);
  window.addEventListener("scroll", position, {
    ...listenerOptions,
    capture: true,
  });
  image.addEventListener(
    "error",
    () => {
      state.dismiss();
      const unavailable = element(
        "div",
        "image-error",
        `Screenshot unavailable: ${capture.image}`,
      );
      unavailable.tabIndex = 0;
      unavailable.setAttribute("aria-describedby", tooltip.id);
      bind(unavailable);
      anchor = unavailable;
      enlarge.replaceWith(unavailable);
    },
    { once: true, signal: lifecycle.signal },
  );
  tooltipHost.append(tooltip);
  function dispose(): void {
    lifecycle.abort();
    state.dispose();
    tooltip.remove();
  }
  figure.append(caption, enlarge);
  return { element: figure, dismissTooltip: dismiss, dispose };
}
