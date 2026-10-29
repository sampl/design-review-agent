// Loads validated reports and coordinates portable routes, panels, and focus.
import {
  validateReport,
  type Report,
  type Issue,
} from "../report-format/index.ts";
import { element } from "./components/dom.ts";
import { showRunDetails } from "./components/RunDetailsModal.ts";
import { createFindingDetail } from "./pages/FindingDetail.ts";
import { createReportIndex } from "./pages/ReportIndex.ts";
import {
  createModalDismissal,
  MODAL_TRANSITION_MS,
} from "./interactions/modalDismissal.ts";
import {
  createIssueNavigation,
  issueIdFromHash,
} from "./interactions/navigation.ts";
const root = document.querySelector<HTMLElement>("#viewer")!;
function failure(
  title: string,
  description: string,
  errors: string[] = [],
): void {
  const card = element("main", "load-state");
  card.append(
    element("div", "eyebrow", "Design QA report"),
    element("h1", "", title),
    element("p", "", description),
  );
  if (errors.length) {
    const list = element("ul", "diagnostics");
    errors.forEach((error) => list.append(element("li", "", error)));
    card.append(list);
  }
  root.replaceChildren(card);
}
function renderReport(report: Report): void {
  document.title = `${report.review.title} · Design QA`;
  let selectedId: string | null = null;
  const mobileLayout = matchMedia("(max-width: 800px)");
  let returnFocus: HTMLElement | null = null;
  let dismissal: ReturnType<typeof createModalDismissal> | undefined;
  const workspace = element("main", "workspace");
  const drawer = element("dialog", "issue-drawer");
  drawer.style.setProperty(
    "--modal-transition-duration",
    `${MODAL_TRANSITION_MS}ms`,
  );
  const findingPage = createFindingDetail(report, closeIssue, drawer);
  const detail = findingPage.element;
  drawer.append(detail);
  const indexPage = createReportIndex(report, {
    openIssue,
    showRunDetails: (body, trigger) =>
      showRunDetails(body, trigger, findingPage.dismissImageTooltips),
    detailId: detail.id,
  });
  const heading = indexPage.heading;
  workspace.append(indexPage.element);
  root.replaceChildren(workspace, drawer);
  const issueNavigation = createIssueNavigation({
    indexUrl,
    state: () => history.state,
    back: () => history.back(),
    issueOpen: () =>
      selectedId !== null &&
      drawer.open &&
      !drawer.classList.contains("is-closing"),
    replace: (state, hash) => history.replaceState(state, "", hash),
    push: (state, hash) => history.pushState(state, "", hash),
    replaceIndex: (url) => history.replaceState(null, "", url),
    changed: synchronizeRoute,
  });
  function closeIssue(): void {
    if (!drawer.classList.contains("is-closing")) issueNavigation.close();
  }
  function indexUrl(): string {
    return `${location.href.split("#")[0]}#/`;
  }
  function openIssue(issue: Issue, trigger: HTMLElement): void {
    returnFocus = trigger;
    issueNavigation.open(issue.id);
  }
  function closeNestedImages(): void {
    findingPage.dismissImageTooltips();
    document
      .querySelectorAll<HTMLDialogElement>(
        ".image-modal[open], .run-details-modal[open]",
      )
      .forEach((dialog) => dialog.close());
  }
  function synchronizeRoute(): void {
    issueNavigation.settled();
    const issueId = issueIdFromHash(
      location.hash,
      report.issues.map((issue) => issue.id),
    );
    if (!issueId) {
      if (location.hash !== "#/") history.replaceState(null, "", indexUrl());
      if (!drawer.open || drawer.classList.contains("is-closing")) return;
      closeNestedImages();
      dismissal?.close();
      return;
    }
    if (
      selectedId === issueId &&
      drawer.open &&
      !drawer.classList.contains("is-closing")
    )
      return;
    closeNestedImages();
    dismissal?.dispose();
    drawer.classList.remove("is-closing");
    root.classList.remove("issue-closing");
    selectedId = issueId;
    findingPage.render(report.issues.find((issue) => issue.id === issueId));
    drawer.setAttribute("aria-labelledby", "finding-title");
    dismissal = createModalDismissal({
      reducedMotion: () =>
        matchMedia("(prefers-reduced-motion: reduce)").matches,
      beginClose: () => {
        drawer.classList.add("is-closing");
        root.classList.add("issue-closing");
      },
      finishClose: () => {
        // Navigation can reverse an exit before its completion callback runs.
        drawer.close();
        drawer.classList.remove("is-closing");
        selectedId = null;
        root.classList.remove("issue-open", "issue-closing");
        findingPage.render(undefined);
        document.documentElement.classList.remove("drawer-open");
        const target = returnFocus?.isConnected ? returnFocus : heading;
        target.focus({ preventScroll: true });
      },
    });
    root.classList.add("issue-open");
    showIssuePanel();
    if (mobileLayout.matches || !returnFocus?.isConnected)
      detail.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    else returnFocus.focus({ preventScroll: true });
  }
  drawer.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeIssue();
  });
  function showIssuePanel(): void {
    document.documentElement.classList.toggle(
      "drawer-open",
      mobileLayout.matches,
    );
    if (drawer.open && drawer.matches(":modal") !== mobileLayout.matches)
      drawer.close();
    if (!drawer.open) {
      if (mobileLayout.matches) drawer.showModal();
      else drawer.show();
    }
  }
  mobileLayout.addEventListener("change", () => {
    if (!drawer.open) return;
    closeNestedImages();
    const focused = document.activeElement as HTMLElement | null;
    showIssuePanel();
    if (mobileLayout.matches)
      detail.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    else focused?.focus({ preventScroll: true });
  });
  // Tooltips consume Escape on document before the desktop panel handles it.
  window.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !event.defaultPrevented &&
      drawer.open &&
      !mobileLayout.matches &&
      !document.querySelector(".image-modal[open], .run-details-modal[open]")
    ) {
      event.preventDefault();
      closeIssue();
    }
  });
  window.addEventListener("popstate", synchronizeRoute);
  window.addEventListener("hashchange", synchronizeRoute);
  synchronizeRoute();
}
async function loadReport(): Promise<void> {
  const embedded = document.getElementById("design-qa-report");
  if (!embedded && location.protocol === "file:") {
    failure(
      "Serve this folder over HTTP",
      "Open a terminal in the report folder, run “python3 -m http.server 8000”, then visit http://localhost:8000. Keep all report assets together.",
    );
    return;
  }
  try {
    let data: unknown;
    try {
      if (embedded) {
        data = JSON.parse(embedded.textContent ?? "");
      } else {
        const response = await fetch("./report.json");
        if (!response.ok)
          throw new Error(`Report request failed (HTTP ${response.status}).`);
        const source = await response.text();
        try {
          data = JSON.parse(source);
        } catch {
          failure(
            "Report JSON could not be read",
            "Check that report.json contains valid JSON, then reload.",
          );
          return;
        }
      }
    } catch {
      failure(
        embedded
          ? "Report JSON could not be read"
          : "Report could not be loaded",
        embedded
          ? "The embedded report is invalid. Generate the report again."
          : "Check that report.json is beside the viewer and reload.",
      );
      return;
    }
    const result = validateReport(data);
    if (!result.valid) {
      failure(
        result.errors.some((error) => error.code === "unsupported-version")
          ? "Unsupported report version"
          : "Report could not be validated",
        "This report has not been displayed. Correct the following fields and reload.",
        result.errors.map((error) => `${error.path || "/"}: ${error.message}`),
      );
      return;
    }
    renderReport(result.report);
  } catch (error) {
    failure(
      "Report could not be loaded",
      error instanceof Error
        ? error.message
        : "Check that report.json is beside the viewer and reload.",
    );
  }
}
void loadReport();
