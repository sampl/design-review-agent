// Keeps capture metadata hoverable, keyboard-visible, and dismissible without moving focus.
export function createTooltipState(
  callbacks: {
    show: () => void;
    hide: () => void;
  },
  { hoverDelayMs = 0 }: { hoverDelayMs?: number } = {},
) {
  let hovered = false;
  let hoverReady = false;
  let focused = false;
  let dismissed = false;
  let visible = false;
  let disposed = false;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function cancelTimers(): void {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }
  function update(): void {
    const next =
      !disposed && !dismissed && ((hovered && hoverReady) || focused);
    if (next === visible) return;
    visible = next;
    if (visible) callbacks.show();
    else callbacks.hide();
  }
  return {
    get visible() {
      return visible;
    },
    hover(value: boolean) {
      if (disposed) return;
      cancelTimers();
      hovered = value;
      if (value) {
        dismissed = false;
        if (visible || focused || hoverDelayMs === 0) {
          hoverReady = true;
          update();
        } else
          showTimer = setTimeout(() => {
            hoverReady = true;
            update();
          }, hoverDelayMs);
      } else {
        hoverReady = false;
        hideTimer = setTimeout(update, 100);
      }
    },
    focus(value: boolean) {
      if (disposed) return;
      cancelTimers();
      focused = value;
      if (value) {
        dismissed = false;
        hoverReady = hovered;
      }
      update();
    },
    dismiss() {
      dismissed = true;
      hoverReady = false;
      cancelTimers();
      update();
    },
    dispose() {
      disposed = true;
      cancelTimers();
      update();
    },
  };
}
