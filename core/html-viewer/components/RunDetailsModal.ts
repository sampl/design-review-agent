// Shows run metadata in a dismissible dialog and restores its initiating control.
import { element, button } from "./dom.ts";
import {
  createModalDismissal,
  MODAL_TRANSITION_MS,
} from "../interactions/modalDismissal.ts";
export function showRunDetails(
  body: HTMLElement,
  trigger: HTMLElement,
  dismissImageTooltips: () => void,
): void {
  dismissImageTooltips();
  const dialog = element("dialog", "modal run-details-modal");
  dialog.style.setProperty(
    "--modal-transition-duration",
    `${MODAL_TRANSITION_MS}ms`,
  );
  const title = element("h2", "", "Run details");
  title.id = "run-details-title";
  title.tabIndex = -1;
  dialog.setAttribute("aria-labelledby", title.id);
  const dismissal = createModalDismissal({
    reducedMotion: () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    beginClose: () => dialog.classList.add("is-closing"),
    finishClose: () => dialog.close(),
  });
  const close = button("", () => dismissal.close(), "run-details-close");
  close.setAttribute("aria-label", "Close run details");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "20");
  icon.setAttribute("height", "20");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 6 18 18M18 6 6 18");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  icon.append(path);
  close.append(icon);
  dialog.append(title, close, body);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismissal.close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dismissal.close();
    }
  });
  dialog.addEventListener(
    "close",
    () => {
      dismissal.dispose();
      dialog.remove();
      trigger.focus({ preventScroll: true });
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  title.focus();
}
