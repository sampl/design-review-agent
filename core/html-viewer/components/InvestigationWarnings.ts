// Presents unverified concerns with expandable details and progressive disclosure.
import type { Report, Warning } from "../../report-format/index.ts";
import { element, button } from "./dom.ts";
import { categories, scopeLabel, warningDisclosure } from "../model.ts";
export function createInvestigationWarnings(
  report: Report,
): HTMLElement | undefined {
  if (!report.warnings.length) return undefined;
  const warnings = element("section", "warnings");
  const warningHeading = element("h2", "sr-only", "Warnings");
  warningHeading.id = "warnings-title";
  warnings.setAttribute("aria-labelledby", warningHeading.id);
  warnings.append(warningHeading);
  function warningCard(warning: Warning): HTMLDetailsElement {
    const card = element("details", "warning-card");
    const trigger = element("summary");
    const warningIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    warningIcon.setAttribute("viewBox", "0 0 24 24");
    warningIcon.setAttribute("width", "16");
    warningIcon.setAttribute("height", "16");
    warningIcon.setAttribute("aria-hidden", "true");
    warningIcon.setAttribute("focusable", "false");
    warningIcon.classList.add("warning-icon");
    const warningPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    warningPath.setAttribute(
      "d",
      "M11 4a1.15 1.15 0 0 1 2 0l8.5 15a1.2 1.2 0 0 1-1 1.8h-17a1.2 1.2 0 0 1-1-1.8L11 4Zm1 4v5m0 3v.25",
    );
    warningPath.setAttribute("fill", "none");
    warningPath.setAttribute("stroke", "currentColor");
    warningPath.setAttribute("stroke-width", "1.5");
    warningPath.setAttribute("stroke-linecap", "round");
    warningPath.setAttribute("stroke-linejoin", "round");
    warningIcon.append(warningPath);
    trigger.append(warningIcon);
    const summaryText = element("span", "warning-summary-text");
    summaryText.append(
      element("span", "", warning.concern),
      element(
        "span",
        "warning-scope",
        ` · ${categories.find((category) => category.id === warning.category)!.title} · ${scopeLabel(report, warning.scope)}`,
      ),
    );
    trigger.append(summaryText);
    const chevron = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    chevron.setAttribute("viewBox", "0 0 16 16");
    chevron.setAttribute("width", "9.6");
    chevron.setAttribute("height", "9.6");
    chevron.setAttribute("aria-hidden", "true");
    chevron.setAttribute("focusable", "false");
    const chevronPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    chevronPath.setAttribute("d", "m6 3 5 5-5 5");
    chevronPath.setAttribute("fill", "none");
    chevronPath.setAttribute("stroke", "currentColor");
    chevronPath.setAttribute("stroke-width", "1.5");
    chevronPath.setAttribute("stroke-linecap", "round");
    chevronPath.setAttribute("stroke-linejoin", "round");
    chevron.append(chevronPath);
    trigger.append(chevron);
    card.append(trigger);
    const diagnostics = element("div", "warning-diagnostics");
    const table = element("table", "context-table warning-table");
    table.setAttribute("aria-label", "Warning details");
    const body = element("tbody");
    const rows = [
      ["Uncertainty", warning.uncertainty],
      ["Next verification", warning.nextVerification],
      ["Warning ID", warning.id.toUpperCase()],
    ];
    for (const [label, content] of rows) {
      const row = element("tr");
      const key = element("th", "", label);
      key.scope = "row";
      row.append(
        key,
        element("td", label === "Warning ID" ? "warning-id" : "", content),
      );
      body.append(row);
    }
    table.append(body);
    diagnostics.append(table);
    card.append(diagnostics);
    return card;
  }
  const initial = warningDisclosure(report.warnings);
  initial.warnings.forEach((warning) => warnings.append(warningCard(warning)));
  if (initial.remaining) {
    const showMore = button(
      `Show ${initial.remaining} more`,
      () => {
        const remaining = warningDisclosure(
          report.warnings,
          true,
        ).warnings.slice(initial.warnings.length);
        const cards = remaining.map(warningCard);
        showMore.replaceWith(...cards);
        cards[0]?.querySelector("summary")?.focus();
      },
      "show-more-warnings",
    );
    warnings.append(showMore);
  }
  return warnings;
}
