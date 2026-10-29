// Builds reusable browser assets without importing synthetic preview fixtures.
import { build } from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { reportSchema } from "../report-format/index.ts";

export async function buildViewer(outputDirectory: string): Promise<void> {
  const viewerDirectory = fileURLToPath(
    new URL("../html-viewer/", import.meta.url),
  );
  await mkdir(outputDirectory, { recursive: true });
  await build({
    entryPoints: [`${viewerDirectory}viewer.ts`],
    outfile: `${outputDirectory}/viewer.js`,
    bundle: true,
    platform: "browser",
    target: "es2023",
    minify: true,
  });
  for (const filename of ["viewer.css", "index.html"])
    await copyFile(
      `${viewerDirectory}${filename}`,
      `${outputDirectory}/${filename}`,
    );
  await writeFile(
    `${outputDirectory}/report.schema.json`,
    JSON.stringify(reportSchema, null, 2),
  );
}
