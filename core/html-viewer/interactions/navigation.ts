// Hash routes keep report links usable when the folder is opened directly.
export function issueHash(issueId: string): string {
  return `#/issues/${encodeURIComponent(issueId)}`;
}
export function issueIdFromHash(
  hash: string,
  issueIds: readonly string[],
): string | null {
  if (!hash.startsWith("#/issues/")) return null;
  try {
    const issueId = decodeURIComponent(hash.slice("#/issues/".length));
    return issueIds.includes(issueId) ? issueId : null;
  } catch {
    return null;
  }
}

// Only traverse Back for entries created from this report's index. Direct links
// replace their current entry so closing cannot send the reader out of the report.
export function createIssueNavigation(callbacks: {
  indexUrl: () => string;
  state: () => unknown;
  back: () => void;
  issueOpen: () => boolean;
  replace: (state: unknown, hash: string) => void;
  push: (state: { designQaIndex: string }, hash: string) => void;
  replaceIndex: (url: string) => void;
  changed: () => void;
}): {
  open: (issueId: string) => void;
  close: () => void;
  settled: () => void;
} {
  let returning = false;
  return {
    open(issueId) {
      returning = false;
      const state = { designQaIndex: callbacks.indexUrl() };
      if (callbacks.issueOpen())
        callbacks.replace(callbacks.state(), issueHash(issueId));
      else callbacks.push(state, issueHash(issueId));
      callbacks.changed();
    },
    close() {
      if (returning) return;
      const state = callbacks.state();
      if (
        state &&
        typeof state === "object" &&
        "designQaIndex" in state &&
        state.designQaIndex === callbacks.indexUrl()
      ) {
        returning = true;
        callbacks.back();
      } else {
        callbacks.replaceIndex(callbacks.indexUrl());
        callbacks.changed();
      }
    },
    settled() {
      returning = false;
    },
  };
}
