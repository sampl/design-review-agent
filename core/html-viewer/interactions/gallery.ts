// Screenshot navigation stays within the current issue's authored image order.
import type { Capture, Issue } from "../../report-format/index.ts";
export type GalleryImage = { label: string; capture: Capture };
export function issueImages(issue: Issue): GalleryImage[] {
  if (issue.evidence.kind !== "screenshot") return [];
  return [
    { label: "Before", capture: issue.evidence.before },
    ...(issue.evidence.proposedAfter
      ? [{ label: "Proposed after", capture: issue.evidence.proposedAfter }]
      : []),
  ];
}
export function nextImageIndex(
  index: number,
  count: number,
  direction: -1 | 1,
): number {
  return Math.max(0, Math.min(index + direction, count - 1));
}
export function imageKeyDirection(
  event: Pick<
    KeyboardEvent,
    "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
): -1 | 1 | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return null;
  return event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : null;
}
