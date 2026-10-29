// Keeps filtering, summaries, and handoff independent of the browser interface.
import {
  reportSchema,
  type Report,
  type Issue,
  type Warning,
  type Category,
  type FindingScope,
} from "../report-format/index.ts";

export const categories = reportSchema.definitions.category.oneOf.map(
  ({ const: id, title }) => ({ id, title }),
);
export type Filters = {
  category: Category | "all";
  query: string;
};
export function reviewedAtLabel(timestamp: string, locale?: string): string {
  const reviewedAt = new Date(timestamp);
  const date = reviewedAt.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = reviewedAt.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}
export function priorityDistribution(report: Report) {
  let offset = 0;
  return (["high", "medium", "low"] as const).map((priority) => {
    const count = report.issues.filter(
      (issue) => issue.priority === priority,
    ).length;
    const percentage = report.issues.length
      ? (count / report.issues.length) * 100
      : 0;
    const segment = { priority, count, percentage, offset };
    offset += percentage;
    return segment;
  });
}
export function priorityDonutSegments(report: Report) {
  return priorityDistribution(report).map((segment) => ({
    ...segment,
    path: donutSegmentPath(segment.offset, segment.percentage),
    label: `${segment.priority[0].toUpperCase()}${segment.priority.slice(1)} priority · ${segment.count} ${segment.count === 1 ? "issue" : "issues"}`,
  }));
}
function donutSegmentPath(offset: number, percentage: number): string {
  if (percentage === 0) return "";
  // Full circles need two arcs; closed inner/outer rings avoid a radial seam.
  if (percentage === 100)
    return "M 44 3 A 41 41 0 1 1 44 85 A 41 41 0 1 1 44 3 Z M 44 17 A 27 27 0 1 0 44 71 A 27 27 0 1 0 44 17 Z";
  const point = (radius: number, position: number): string => {
    const angle = (position / 100) * Math.PI * 2 - Math.PI / 2;
    return `${44 + radius * Math.cos(angle)} ${44 + radius * Math.sin(angle)}`;
  };
  const end = offset + percentage;
  const largeArc = percentage > 50 ? 1 : 0;
  return `M ${point(41, offset)} A 41 41 0 ${largeArc} 1 ${point(41, end)} L ${point(27, end)} A 27 27 0 ${largeArc} 0 ${point(27, offset)} Z`;
}
export function warningDisclosure(
  warnings: Warning[],
  expanded = false,
): { warnings: Warning[]; remaining: number } {
  const visible = expanded ? warnings.slice() : warnings.slice(0, 3);
  return { warnings: visible, remaining: warnings.length - visible.length };
}
export function scopeLabel(report: Report, scope: FindingScope): string {
  return scope.kind === "app-wide"
    ? "App-wide"
    : scope.areaIds
        .map(
          (id) =>
            report.review.areas.find((area) => area.id === id)?.name ?? id,
        )
        .join(", ");
}
export function visibleIssues(report: Report, filters: Filters): Issue[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const ranks = { high: 0, medium: 1, low: 2 };
  return report.issues
    .filter(
      (issue) =>
        (filters.category === "all" || issue.category === filters.category) &&
        (!query ||
          searchableText(report, issue).toLocaleLowerCase().includes(query)),
    )
    .toSorted((left, right) => ranks[left.priority] - ranks[right.priority]);
}
export function locationTarget(
  reference: string,
  baseUrl?: string,
): string | null {
  const parseWebUrl = (value: string): URL | null => {
    if (
      !/^https?:\/\/[^/?#]/i.test(value) ||
      value !== value.trim() ||
      /[\\\u0000-\u001f\u007f]/.test(value)
    )
      return null;
    try {
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
        ? parsed
        : null;
    } catch {
      return null;
    }
  };
  if (
    !baseUrl ||
    !reference.startsWith("/") ||
    reference.startsWith("//") ||
    /[\s\\\u0000-\u0020\u007f]/.test(reference)
  )
    return null;
  const base = parseWebUrl(baseUrl);
  if (!base) return null;
  try {
    const destination = new URL(reference, base);
    return destination.origin === base.origin ? destination.href : null;
  } catch {
    return null;
  }
}
function searchableText(report: Report, issue: Issue): string {
  return [
    issue.id,
    issue.title,
    issue.problem,
    issue.suggestedSolution,
    issue.priorityRationale,
    issue.benefit,
    issue.priority,
    categories.find((category) => category.id === issue.category)?.title,
    scopeLabel(report, issue.scope),
    ...issue.locations.flatMap((location) => [location.name, location.url]),
    ...issue.acceptanceCriteria,
    ...(issue.reproductionSteps ?? []),
    issue.evidence.observation,
    issue.evidence.support,
    ...(issue.evidence.kind === "nonvisual"
      ? [issue.evidence.method, issue.evidence.location, issue.evidence.state]
      : [issue.evidence.before.route, issue.evidence.before.state]),
  ].join(" ");
}
function markdownText(value: string): string {
  return value.replaceAll("\\", "\\\\").replace(/([`*_{}[\]<>#!|])/g, "\\$1");
}
export function findingLinearUrl(report: Report, issue: Issue): string {
  const destination = new URL("https://linear.new");
  destination.searchParams.set("title", issue.title);
  destination.searchParams.set("description", findingMarkdown(report, issue));
  return destination.href;
}
export function findingGithubUrl(report: Report, issue: Issue): string | null {
  if (!report.review.githubRepository) return null;
  const destination = new URL(`${report.review.githubRepository}/issues/new`);
  destination.searchParams.set("title", issue.title);
  destination.searchParams.set("body", findingMarkdown(report, issue));
  return destination.href;
}
export function findingMarkdown(report: Report, issue: Issue): string {
  const lines = [
    `# ${markdownText(issue.title)}`,
    "",
    `Finding ID: ${markdownText(issue.id)}`,
    "",
    `Priority: ${issue.priority[0].toUpperCase()}${issue.priority.slice(1)}`,
    `Priority explanation: ${markdownText(issue.priorityRationale)}`,
    `Category: ${categories.find((category) => category.id === issue.category)?.title}`,
    `Scope: ${markdownText(scopeLabel(report, issue.scope))}`,
    ...(report.review.baseUrl
      ? [`App base URL: ${markdownText(report.review.baseUrl)}`]
      : []),
    "",
    markdownText(issue.problem),
  ];
  const section = (
    title: string,
    content: string | string[],
    { ordered = false, level = 2 } = {},
  ) => {
    lines.push(
      "",
      `${"#".repeat(level)} ${title}`,
      "",
      ...(Array.isArray(content)
        ? content.map(
            (text, index) =>
              `${ordered ? `${index + 1}.` : "-"} ${markdownText(text)}`,
          )
        : [markdownText(content)]),
    );
  };
  const evidence = issue.evidence;
  lines.push("", "## Evidence");
  section(
    evidence.kind === "screenshot"
      ? "Visual evidence"
      : markdownText(evidence.method),
    evidence.observation,
    { level: 3 },
  );
  if (evidence.kind === "nonvisual")
    lines.push(
      "",
      ...[`Location: ${evidence.location}`, `State: ${evidence.state}`].map(
        markdownText,
      ),
    );
  else {
    const capture = evidence.before;
    // Proposal metadata matches the before capture; omit duplicate metadata while images are excluded.
    lines.push(
      "",
      ...[
        `Route: ${capture.route}`,
        `State: ${capture.state}`,
        `Viewport: ${capture.viewport.width} × ${capture.viewport.height}`,
        `Image dimensions: ${capture.imageDimensions.width} × ${capture.imageDimensions.height}`,
        `Scroll: ${capture.scroll.x}, ${capture.scroll.y}`,
      ].map(markdownText),
    );
  }
  section("What this supports", evidence.support, { level: 4 });
  lines.push("", "## Locations", "");
  for (const location of issue.locations) {
    const target = locationTarget(location.url, report.review.baseUrl);
    lines.push(
      target
        ? `- [${markdownText(location.name)}](<${target.replaceAll("<", "%3C").replaceAll(">", "%3E")}>) — ${markdownText(location.url)}`
        : `- ${markdownText(location.name)} — ${markdownText(location.url)}`,
    );
  }
  if (issue.reproductionSteps)
    section("To reproduce", issue.reproductionSteps, { ordered: true });
  section("Suggested solution", issue.suggestedSolution);
  section("Expected benefit", issue.benefit, { level: 3 });
  section("Acceptance criteria", issue.acceptanceCriteria, { level: 3 });
  return `${lines.join("\n")}\n`;
}
