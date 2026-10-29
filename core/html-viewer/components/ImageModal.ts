// Presents a screenshot gallery with keyboard navigation and restored focus.
import { element, button } from "./dom.ts";
import {
  nextImageIndex,
  imageKeyDirection,
  type GalleryImage,
} from "../interactions/gallery.ts";
import {
  createModalDismissal,
  MODAL_TRANSITION_MS,
} from "../interactions/modalDismissal.ts";
export function showImageModal(
  images: GalleryImage[],
  initialIndex: number,
  dismissImageTooltips: () => void,
): void {
  dismissImageTooltips();
  let imageIndex = initialIndex;
  const body = element("img", "enlarged");
  const announcement = element("span", "sr-only");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = element("dialog", "modal image-modal has-gallery");
  dialog.style.setProperty(
    "--modal-transition-duration",
    `${MODAL_TRANSITION_MS}ms`,
  );
  const dismissal = createModalDismissal({
    reducedMotion: () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    beginClose: () => dialog.classList.add("is-closing"),
    finishClose: () => dialog.close(),
  });
  const close = button("", () => dismissal.close(), "image-close");
  close.setAttribute("aria-label", "Close");
  const closeIcon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  closeIcon.setAttribute("viewBox", "0 0 24 24");
  closeIcon.setAttribute("width", "20");
  closeIcon.setAttribute("height", "20");
  closeIcon.setAttribute("aria-hidden", "true");
  closeIcon.setAttribute("focusable", "false");
  const closePath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  closePath.setAttribute("d", "M6 6 18 18M18 6 6 18");
  closePath.setAttribute("fill", "none");
  closePath.setAttribute("stroke", "currentColor");
  closePath.setAttribute("stroke-width", "1.5");
  closePath.setAttribute("stroke-linecap", "round");
  closeIcon.append(closePath);
  close.append(closeIcon);
  const imageControls = new Map<-1 | 1, HTMLButtonElement>();
  function showImage(): void {
    const image = images[imageIndex];
    body.src = image.capture.image;
    body.alt = `${image.label}: ${image.capture.state}`;
    const label = `${image.label} screenshot${images.length > 1 ? `, image ${imageIndex + 1} of ${images.length}` : ""}`;
    dialog.setAttribute("aria-label", label);
    announcement.textContent = label;
    for (const [direction, control] of imageControls)
      control.disabled =
        nextImageIndex(imageIndex, images.length, direction) === imageIndex;
  }
  function navigate(direction: -1 | 1): void {
    if (dialog.classList.contains("is-closing")) return;
    const nextIndex = nextImageIndex(imageIndex, images.length, direction);
    if (nextIndex === imageIndex) return;
    const focusedControl = document.activeElement;
    imageIndex = nextIndex;
    showImage();
    // Disabling the clicked boundary control must not leave keyboard focus outside the dialog.
    if (focusedControl instanceof HTMLButtonElement && focusedControl.disabled)
      close.focus();
  }
  dialog.append(body, close, announcement);
  for (const direction of [-1, 1] as const) {
    const arrow = button(
      "",
      () => navigate(direction),
      `image-navigation ${direction === -1 ? "image-previous" : "image-next"}`,
    );
    arrow.setAttribute(
      "aria-label",
      direction === -1 ? "Previous image" : "Next image",
    );
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "24");
    icon.setAttribute("height", "24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      direction === -1 ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6",
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    icon.append(path);
    arrow.append(icon);
    dialog.append(arrow);
    imageControls.set(direction, arrow);
  }
  dialog.addEventListener("keydown", (event) => {
    const direction = imageKeyDirection(event);
    if (
      direction === null ||
      event.defaultPrevented ||
      !dialog.matches(":modal")
    )
      return;
    event.preventDefault();
    navigate(direction);
  });
  showImage();
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dismissal.close();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismissal.close();
  });
  dialog.addEventListener(
    "close",
    () => {
      dismissal.dispose();
      dialog.remove();
      previousFocus?.focus();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}
