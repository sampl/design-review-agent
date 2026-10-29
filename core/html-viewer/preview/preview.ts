// Hosts a development-only scenario picker outside the actual report viewer.
import { scenarios } from "../../report-format/fixtures/scenarios.ts";
const picker = document.querySelector<HTMLSelectElement>("#scenario")!;
const frame = document.querySelector<HTMLIFrameElement>("#report-frame")!;
const standalone = document.querySelector<HTMLAnchorElement>("#standalone")!;
scenarios.forEach((scenario) => {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.title;
  picker.append(option);
});
function show(): void {
  const params = new URL(location.href).searchParams;
  const scenario =
    scenarios.find((item) => item.id === params.get("scenario")) ??
    scenarios[0];
  picker.value = scenario.id;
  const source = `./reports/${scenario.id}/index.html`;
  frame.src = source;
  standalone.href = source;
}
picker.addEventListener("change", () => {
  const url = new URL(location.href);
  url.searchParams.set("scenario", picker.value);
  history.pushState({}, "", url);
  show();
});
window.addEventListener("popstate", show);
show();
