// Keeps clipboard feedback current across repeated attempts and detail changes.
export function createCopyFeedback(callbacks: {
  writeText: (text: string) => Promise<void>;
  showCopied: () => void;
  resetLabel: () => void;
  showFailed: () => void;
}): { copy: (text: string) => Promise<void>; dispose: () => void } {
  let attempt = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancelFeedback(): void {
    clearTimeout(timer);
    timer = undefined;
    attempt += 1;
  }
  return {
    async copy(text) {
      if (disposed) return;
      cancelFeedback();
      const currentAttempt = attempt;
      callbacks.resetLabel();
      let copied = false;
      try {
        await callbacks.writeText(text);
        copied = true;
      } catch {
        // A denied clipboard write uses the same short-lived button feedback.
      }
      if (disposed || currentAttempt !== attempt) return;
      if (copied) callbacks.showCopied();
      else callbacks.showFailed();
      timer = setTimeout(() => {
        if (!disposed && currentAttempt === attempt) callbacks.resetLabel();
      }, 1000);
    },
    dispose() {
      disposed = true;
      cancelFeedback();
    },
  };
}
