// Renders finding content while the workspace controls its route and responsive panel.
import type { Report, Issue } from "../../report-format/index.ts";
import { element, button, section } from "../components/dom.ts";
import {
  categories,
  scopeLabel,
  findingMarkdown,
  findingLinearUrl,
  findingGithubUrl,
  locationTarget,
} from "../model.ts";
import { issueImages } from "../interactions/gallery.ts";
import { createCopyFeedback } from "../interactions/copyFeedback.ts";
import { priorityBadge } from "../components/PriorityBadge.ts";
import { screenshot } from "../components/Screenshot.ts";
import { showImageModal } from "../components/ImageModal.ts";
export function createFindingDetail(
  report: Report,
  closeIssue: () => void,
  tooltipHost: HTMLElement,
): {
  element: HTMLElement;
  render: (issue: Issue | undefined) => void;
  dismissImageTooltips: () => void;
} {
  const detail = element("article", "issue-detail");
  detail.id = "issue-detail";
  const detailTooltipCleanups = new Set<() => void>();
  const imageTooltipDismissals = new Set<() => void>();
  function dismissImageTooltips(): void {
    imageTooltipDismissals.forEach((dismiss) => dismiss());
  }
  function createPriorityBadge(issue: Issue): HTMLElement {
    const badge = priorityBadge(issue, tooltipHost);
    detailTooltipCleanups.add(badge.dispose);
    return badge.element;
  }
  let copyFeedback: ReturnType<typeof createCopyFeedback> | undefined;
  function render(issue: Issue | undefined): void {
    detailTooltipCleanups.forEach((cleanup) => cleanup());
    detailTooltipCleanups.clear();
    imageTooltipDismissals.clear();
    copyFeedback?.dispose();
    detail.replaceChildren();
    tooltipHost.scrollTop = 0;
    if (!issue) {
      detail.removeAttribute("aria-labelledby");
      detail.append(
        element(
          "div",
          "detail-placeholder",
          "Select a finding to review its evidence and recommendation.",
        ),
      );
      return;
    }
    const detailHeader = element("header", "detail-header");
    const back = button("← Back to report", closeIssue, "drawer-back");
    const closeFinding = button("", closeIssue, "finding-close");
    closeFinding.setAttribute("aria-label", "Close finding");
    const closeIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    closeIcon.setAttribute("viewBox", "0 0 24 24");
    closeIcon.setAttribute("width", "20");
    closeIcon.setAttribute("height", "20");
    closeIcon.setAttribute("aria-hidden", "true");
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
    closeFinding.append(closeIcon);
    const title = element("h2", "", issue.title);
    title.tabIndex = -1;
    title.id = "finding-title";
    detail.setAttribute("aria-labelledby", title.id);
    const actions = element("div", "detail-actions");
    const copyLabel = element("span", "", "Copy Markdown");
    const copy = button(
      "",
      () => {
        void copyFeedback?.copy(findingMarkdown(report, issue));
      },
      "detail-action",
    );
    const copyIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    copyIcon.setAttribute("viewBox", "0 0 16 16");
    copyIcon.setAttribute("width", "14");
    copyIcon.setAttribute("height", "14");
    copyIcon.setAttribute("aria-hidden", "true");
    copyIcon.setAttribute("focusable", "false");
    const copyPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    copyPath.setAttribute("d", "M5.5 3.5V2h8v8H12M3 5h7v9H3z");
    copyPath.setAttribute("fill", "none");
    copyPath.setAttribute("stroke", "currentColor");
    copyPath.setAttribute("stroke-linejoin", "round");
    copyIcon.append(copyPath);
    copy.append(copyIcon, copyLabel);
    copy.setAttribute("aria-live", "polite");
    copyFeedback = createCopyFeedback({
      writeText: (text) => navigator.clipboard.writeText(text),
      showCopied: () => {
        copyLabel.textContent = "Copied!";
      },
      resetLabel: () => {
        copyLabel.textContent = "Copy Markdown";
      },
      showFailed: () => {
        copyLabel.textContent = "Copy failed";
      },
    });
    const createLinearTicket = element("a", "detail-action linear-action");
    const linearIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    linearIcon.setAttribute("viewBox", "0 0 24 24");
    linearIcon.setAttribute("width", "14");
    linearIcon.setAttribute("height", "14");
    linearIcon.setAttribute("aria-hidden", "true");
    linearIcon.setAttribute("focusable", "false");
    const linearClip = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "clipPath",
    );
    linearClip.id = "linear-icon-circle";
    const linearCircle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    linearCircle.setAttribute("cx", "12");
    linearCircle.setAttribute("cy", "12");
    linearCircle.setAttribute("r", "11");
    linearClip.append(linearCircle);
    const linearPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    linearPath.setAttribute(
      "d",
      "M0 0h24v24h-2L0 2Zm0 4 20 20h-3L0 7Zm0 5 15 15h-3L0 12Zm0 5 10 10H7l-7-7Zm0 5 5 5H2l-2-2Z",
    );
    linearPath.setAttribute("clip-path", "url(#linear-icon-circle)");
    linearPath.setAttribute("fill", "currentColor");
    linearIcon.append(linearClip, linearPath);
    createLinearTicket.append(
      linearIcon,
      element("span", "", "Create in Linear"),
    );
    createLinearTicket.href = findingLinearUrl(report, issue);
    createLinearTicket.target = "_blank";
    createLinearTicket.rel = "noopener noreferrer";
    actions.append(createLinearTicket);
    const githubUrl = findingGithubUrl(report, issue);
    if (githubUrl) {
      const createGithubIssue = element("a", "detail-action");
      const githubIcon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      githubIcon.setAttribute("viewBox", "0 0 24 24");
      githubIcon.setAttribute("width", "14");
      githubIcon.setAttribute("height", "14");
      githubIcon.setAttribute("aria-hidden", "true");
      githubIcon.setAttribute("focusable", "false");
      const githubPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      githubPath.setAttribute(
        "d",
        "M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.63 1.22 3.27.93.1-.72.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.57 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.62 0c2.15-1.46 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.33-2.63 5.29-5.14 5.57.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.77.54A11.25 11.25 0 0 0 12 .75Z",
      );
      githubPath.setAttribute("fill", "currentColor");
      githubIcon.append(githubPath);
      createGithubIssue.append(githubIcon, element("span", "", "Create issue"));
      createGithubIssue.href = githubUrl;
      createGithubIssue.target = "_blank";
      createGithubIssue.rel = "noopener noreferrer";
      actions.append(createGithubIssue);
    }
    actions.append(copy);
    const metadata = element("div", "finding-metadata");
    metadata.append(
      createPriorityBadge(issue),
      element(
        "p",
        "muted",
        `${categories.find((category) => category.id === issue.category)?.title} · ${scopeLabel(report, issue.scope)}`,
      ),
    );
    detailHeader.append(
      back,
      closeFinding,
      element("p", "finding-id", issue.id),
      title,
      metadata,
      actions,
    );
    detail.append(detailHeader, element("p", "problem-intro", issue.problem));
    const evidenceSection = element("section", "evidence-section");
    evidenceSection.append(element("h3", "", "Evidence"));
    const evidence = issue.evidence;
    const block = element("section", "evidence-block");
    block.append(
      element(
        "h4",
        "",
        evidence.kind === "screenshot" ? "Visual evidence" : evidence.method,
      ),
      element("p", "", evidence.observation),
    );
    if (evidence.kind === "screenshot") {
      const comparison = element(
        "div",
        `comparison ${evidence.proposedAfter ? "paired" : ""}`,
      );
      const images = issueImages(issue);
      images.forEach((image, index) => {
        const capture = screenshot(
          image.capture,
          image.label,
          tooltipHost,
          () => showImageModal(images, index, dismissImageTooltips),
        );
        imageTooltipDismissals.add(capture.dismissTooltip);
        detailTooltipCleanups.add(capture.dispose);
        comparison.append(capture.element);
      });
      block.append(comparison);
    } else
      block.append(
        element("p", "muted", `${evidence.location} · ${evidence.state}`),
      );
    const support = element("section", "text-section evidence-support");
    support.append(
      element("h5", "", "What this supports"),
      element("p", "", evidence.support),
    );
    block.append(support);
    evidenceSection.append(block);
    const locations = element("section", "text-section");
    locations.append(element("h3", "", "Locations"));
    const locationList = element("ul", "location-list");
    locationList.setAttribute("role", "list");
    for (const location of issue.locations) {
      const item = element("li");
      const target = locationTarget(location.url, report.review.baseUrl);
      const row = target
        ? element("a", "location-row")
        : element("div", "location-row");
      if (target) {
        row.setAttribute("href", target);
        row.setAttribute("target", "_blank");
        row.setAttribute("rel", "noopener noreferrer");
      }
      const pageIcon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      pageIcon.setAttribute("viewBox", "0 0 24 24");
      pageIcon.setAttribute("width", "16");
      pageIcon.setAttribute("height", "16");
      pageIcon.setAttribute("aria-hidden", "true");
      pageIcon.setAttribute("focusable", "false");
      const pagePath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      pagePath.setAttribute(
        "d",
        "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM3 9h18",
      );
      pagePath.setAttribute("fill", "none");
      pagePath.setAttribute("stroke", "currentColor");
      pagePath.setAttribute("stroke-width", "1.5");
      pagePath.setAttribute("stroke-linejoin", "round");
      pageIcon.append(pagePath);
      const text = element("span", "location-text");
      text.append(
        element("span", "location-name", location.name),
        element("code", "location-url", location.url),
      );
      row.append(pageIcon, text);
      if (target) {
        const arrow = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        arrow.setAttribute("viewBox", "0 0 24 24");
        arrow.setAttribute("width", "16");
        arrow.setAttribute("height", "16");
        arrow.setAttribute("aria-hidden", "true");
        arrow.setAttribute("focusable", "false");
        arrow.classList.add("location-arrow");
        const arrowPath = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        arrowPath.setAttribute("d", "M7 17 17 7M7 7h10v10");
        arrowPath.setAttribute("fill", "none");
        arrowPath.setAttribute("stroke", "currentColor");
        arrowPath.setAttribute("stroke-width", "1.5");
        arrowPath.setAttribute("stroke-linecap", "round");
        arrowPath.setAttribute("stroke-linejoin", "round");
        arrow.append(arrowPath);
        row.append(arrow);
      }
      item.append(row);
      locationList.append(item);
    }
    locations.append(locationList);
    const solution = section("Suggested solution", issue.suggestedSolution);
    const benefit = element("section", "solution-subsection");
    benefit.append(
      element("h4", "", "Expected benefit"),
      element("p", "", issue.benefit),
    );
    const acceptance = element("section", "solution-subsection");
    acceptance.append(element("h4", "", "Acceptance criteria"));
    const criteriaList = element("ul", "criteria-list");
    criteriaList.setAttribute("role", "list");
    for (const criterion of issue.acceptanceCriteria) {
      const item = element("li");
      const checkmark = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      checkmark.setAttribute("viewBox", "0 0 16 16");
      checkmark.setAttribute("width", "12");
      checkmark.setAttribute("height", "12");
      checkmark.setAttribute("aria-hidden", "true");
      checkmark.setAttribute("focusable", "false");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", "m3 8 3 3 7-7");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      checkmark.append(path);
      item.append(checkmark, element("span", "", criterion));
      criteriaList.append(item);
    }
    acceptance.append(criteriaList);
    solution.append(benefit, acceptance);
    detail.append(evidenceSection, locations);
    if (issue.reproductionSteps)
      detail.append(section("To reproduce", issue.reproductionSteps, true));
    detail.append(solution);
  }
  return { element: detail, render, dismissImageTooltips };
}
