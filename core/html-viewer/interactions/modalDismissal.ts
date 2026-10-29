// Keeps the native modal open and focused until its closing transition finishes.
export const MODAL_TRANSITION_MS = 150;
export function createModalDismissal(callbacks: {
  reducedMotion: () => boolean;
  beginClose: () => void;
  finishClose: () => void;
}): { close: () => void; dispose: () => void } {
  let closing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    close() {
      if (closing) return;
      closing = true;
      if (callbacks.reducedMotion()) callbacks.finishClose();
      else {
        callbacks.beginClose();
        timer = setTimeout(callbacks.finishClose, MODAL_TRANSITION_MS);
      }
    },
    dispose() {
      closing = true;
      clearTimeout(timer);
    },
  };
}
