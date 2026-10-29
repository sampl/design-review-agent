// Preserves report overview, filters, disclosures, and list state while a finding is open.
import type { Report, Issue } from "../../report-format/index.ts";
import { element, button } from "../components/dom.ts";
import {
  categories,
  reviewedAtLabel,
  visibleIssues,
  scopeLabel,
  type Filters,
} from "../model.ts";
import { issueHash } from "../interactions/navigation.ts";
import { createPrioritySummary } from "../components/PrioritySummary.ts";
import { createInvestigationWarnings } from "../components/InvestigationWarnings.ts";
export function createReportIndex(
  report: Report,
  callbacks: {
    openIssue: (issue: Issue, trigger: HTMLElement) => void;
    showRunDetails: (body: HTMLElement, trigger: HTMLElement) => void;
    detailId: string;
  },
): { element: HTMLElement; heading: HTMLElement } {
  let filters: Filters = { category: "all", query: "" };
  const content = element("section", "report-content");
  const reportHeader = element("header", "report-header");
  const runMetadata = element("p", "report-run-metadata muted");
  const scannedAt = element(
    "time",
    "",
    reviewedAtLabel(report.review.reviewedAt),
  );
  scannedAt.dateTime = report.review.reviewedAt;
  const runDetailsBody = element("div", "run-details-body");
  const detailsLink = button(
    "Details",
    () => callbacks.showRunDetails(runDetailsBody, detailsLink),
    "run-details-link",
  );
  detailsLink.setAttribute("aria-haspopup", "dialog");
  runMetadata.append(scannedAt, detailsLink);
  reportHeader.append(element("h1", "", report.review.title), runMetadata);
  const columns = element("div", "columns");
  const center = element("section", "issue-column");
  center.setAttribute("aria-label", "Findings");
  const summary = element("div", "overview-summary");
  const heading = element("h2", "sr-only");
  const controls = element("div", "filters");
  const searchLabel = element("label", "search-label");
  searchLabel.append(element("span", "sr-only", "Search findings"));
  const search = element("input");
  search.type = "search";
  search.placeholder = "Search";
  searchLabel.append(search);
  const typeLabel = element("label", "type-label");
  typeLabel.append(element("span", "sr-only", "Issue type"));
  const typeFilter = element("select");
  typeFilter.setAttribute("aria-label", "Issue type");
  for (const category of [
    { id: "all", title: "All issue types" },
    ...categories,
  ]) {
    const option = element("option", "", category.title);
    option.value = category.id;
    typeFilter.append(option);
  }
  typeLabel.append(typeFilter);
  controls.append(searchLabel, typeLabel);
  const issueList = element("div", "issue-list");
  heading.textContent = "Issues";
  heading.className = "sr-only";
  center.append(summary, heading, controls, issueList);
  columns.append(center);
  const footer = element("footer", "report-footer");
  const copyrightLink = element("a", "", "Directed Works LLC");
  copyrightLink.href = "https://directedworks.com";
  footer.append(
    document.createTextNode(`© ${new Date().getFullYear()} `),
    copyrightLink,
  );
  content.append(columns, footer);
  const priorityTooltipCleanups: (() => void)[] = [];
  function overview(): void {
    priorityTooltipCleanups.splice(0).forEach((cleanup) => cleanup());
    summary.replaceChildren();
    const overviewHeader = element("div", "report-overview-header");
    overviewHeader.append(reportHeader);
    summary.append(overviewHeader);
    const priorities = createPrioritySummary(report);
    priorityTooltipCleanups.push(priorities.dispose);
    overviewHeader.append(priorities.element);
    const contextTable = element("table", "context-table");
    contextTable.setAttribute("aria-label", "Run details");
    const contextBody = element("tbody");
    const contextRows: [string, string | string[]][] = [
      [
        "Area coverage",
        report.review.areas.length
          ? report.review.areas.map(
              (area) =>
                `${area.name} — ${area.reviewed ? "Reviewed" : "Not reviewed"}`,
            )
          : "No areas recorded.",
      ],
      ...(report.review.baseUrl
        ? [["App base URL", report.review.baseUrl] as [string, string]]
        : []),
      ["Reviewed at", report.review.reviewedAt],
      ["Scope", report.review.scope],
      ["Evidence summary", report.review.evidenceSummary],
      [
        "Limitations",
        report.review.limitations.length
          ? report.review.limitations
          : "None recorded.",
      ],
      [
        "Outstanding questions",
        report.review.outstandingQuestions.length
          ? report.review.outstandingQuestions
          : "None recorded.",
      ],
    ];
    for (const [label, content] of contextRows) {
      const row = element("tr");
      const key = element("th", "", label);
      key.scope = "row";
      const value = element("td");
      if (Array.isArray(content)) {
        const list = element("ul");
        content.forEach((text) => list.append(element("li", "", text)));
        value.append(list);
      } else value.textContent = content;
      row.append(key, value);
      contextBody.append(row);
    }
    contextTable.append(contextBody);
    const warnings = createInvestigationWarnings(report);
    if (warnings) summary.append(warnings);
    runDetailsBody.replaceChildren(contextTable);
  }

  heading.tabIndex = -1;
  function update(): void {
    const categoryEmpty = !report.issues.some(
      (issue) =>
        filters.category === "all" || issue.category === filters.category,
    );
    const issues = visibleIssues(report, filters);
    issueList.replaceChildren();
    if (!issues.length) {
      const empty = element("div", "empty-state");
      empty.append(
        element(
          "h3",
          "",
          categoryEmpty
            ? report.issues.length
              ? "No findings in this category"
              : "No findings in this report"
            : "No matching findings",
        ),
        element(
          "p",
          "muted",
          categoryEmpty
            ? "Review the coverage and limitations before drawing conclusions."
            : "Try a different search.",
        ),
      );
      if (!categoryEmpty)
        empty.append(
          button(
            "Clear search",
            () => {
              filters = { ...filters, query: "" };
              search.value = "";
              update();
            },
            "secondary",
          ),
        );
      issueList.append(empty);
    } else {
      const table = element("table");
      const tableHead = element("thead", "sr-only");
      const labels = element("tr");
      labels.append(
        element("th", "", "Finding"),
        element("th", "", "Priority"),
      );
      labels.querySelectorAll("th").forEach((header) => (header.scope = "col"));
      tableHead.append(labels);
      table.append(tableHead);
      const body = element("tbody");
      issues.forEach((issue) => {
        const row = element("tr");
        const name = element("td");
        const select = element("a", "issue-link", issue.title);
        select.href = issueHash(issue.id);
        select.addEventListener("click", (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          callbacks.openIssue(issue, select);
        });
        select.setAttribute("aria-controls", callbacks.detailId);
        select.setAttribute("aria-haspopup", "dialog");
        const rowMetadata = element("p", "row-metadata");
        rowMetadata.append(
          element(
            "span",
            "",
            `${categories.find((category) => category.id === issue.category)!.title} - ${scopeLabel(report, issue.scope)}`,
          ),
        );
        name.append(select, rowMetadata);
        const level = element("td");
        level.append(
          element(
            "span",
            `priority ${issue.priority}`,
            issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1),
          ),
        );
        row.append(name, level);
        body.append(row);
      });
      table.append(body);
      issueList.append(table);
    }
  }
  typeFilter.addEventListener("change", () => {
    filters = { ...filters, category: typeFilter.value as Filters["category"] };
    update();
  });
  search.addEventListener("input", () => {
    filters = { ...filters, query: search.value };
    update();
  });
  overview();
  update();
  return { element: content, heading };
}
