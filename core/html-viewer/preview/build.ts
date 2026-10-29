// Builds local viewer assets and synthetic development reports, without packaging user reports.
import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  scenarios,
  previewReport,
} from "../../report-format/fixtures/scenarios.ts";
import { buildViewer } from "../../build-scripts/buildViewer.ts";
import { settingsScreenshot } from "../../report-format/fixtures/screenshots.ts";
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const output = `${packageRoot}dist`;
await buildViewer(`${output}/viewer`);
await mkdir(`${output}/preview`, { recursive: true });
await build({
  entryPoints: [`${packageRoot}html-viewer/preview/preview.ts`],
  outfile: `${output}/preview/preview.js`,
  bundle: true,
  platform: "browser",
  minify: true,
});
await copyFile(
  `${packageRoot}html-viewer/preview/index.html`,
  `${output}/preview/index.html`,
);
for (const scenario of scenarios) {
  const folder = `${output}/preview/reports/${scenario.id}`;
  await mkdir(`${folder}/images`, { recursive: true });
  for (const name of [
    "index.html",
    "viewer.js",
    "viewer.css",
    "report.schema.json",
  ])
    await writeFile(
      `${folder}/${name}`,
      await readFile(`${output}/viewer/${name}`),
    );
  if (scenario.id !== "missing")
    await writeFile(
      `${folder}/report.json`,
      scenario.id === "malformed"
        ? "{invalid JSON"
        : JSON.stringify(previewReport(scenario.id), null, 2),
    );
  for (const [name, proposed] of [
    ["settings-before.svg", false],
    ["settings-proposal.svg", true],
  ] as const)
    await writeFile(`${folder}/images/${name}`, settingsScreenshot(proposed));
}
console.info("◈ Built viewer and synthetic previews in dist/preview.");
