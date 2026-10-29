// Verifies portable reports at the filesystem and authored-content boundaries.
import assert from "node:assert/strict";
import { afterAll, beforeAll, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { completeReport, emptyReport } from "./fixtures/contract.ts";
import { packageReport } from "./packageReport.ts";
import { buildViewer } from "../build-scripts/buildViewer.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let root: string;
let viewerDirectory: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "design-qa-package-"));
  viewerDirectory = join(root, "viewer");
  await buildViewer(viewerDirectory);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function scenario() {
  const directory = await mkdtemp(join(root, "case-"));
  const evidenceDirectory = join(directory, "evidence");
  const outputDirectory = join(directory, "output");
  await mkdir(join(evidenceDirectory, "images"), { recursive: true });
  await writeFile(join(evidenceDirectory, "images/settings-before.png"), png);
  await writeFile(join(evidenceDirectory, "images/settings-proposal.png"), png);
  const report = completeReport();
  const evidence = report.issues[0].evidence;
  if (evidence.kind !== "screenshot")
    throw new Error("Expected screenshot fixture");
  evidence.before.imageDimensions = { width: 1, height: 1 };
  if (evidence.proposedAfter)
    evidence.proposedAfter.imageDimensions = { width: 1, height: 1 };
  return { report, evidenceDirectory, outputDirectory, viewerDirectory };
}

it("packages embedded, text-safe HTML, separate JSON, schema, and deduplicated relative PNGs", async () => {
  const input = await scenario();
  input.report.review.title =
    "Synthetic </script><img src=x onerror=alert(1)> report";
  const original = structuredClone(input.report);
  const result = await packageReport(input);
  assert.deepEqual(input.report, original);
  const html = await readFile(
    join(input.outputDirectory, "index.html"),
    "utf8",
  );
  assert.ok(html.includes('id="design-qa-report"'));
  assert.ok(!html.includes('src="./viewer.js"'));
  assert.ok(!html.includes('href="./viewer.css"'));
  assert.ok(!html.includes("</script><img src=x"));
  const embedded = html.match(/id="design-qa-report">(.*?)<\/script>/s)?.[1];
  assert.deepEqual(JSON.parse(embedded!), result.report);
  assert.deepEqual(
    JSON.parse(
      await readFile(join(input.outputDirectory, "report.json"), "utf8"),
    ),
    result.report,
  );
  assert.equal(
    (await readdir(join(input.outputDirectory, "images"))).length,
    1,
  );
  const evidence = result.report.issues[0].evidence;
  if (evidence.kind !== "screenshot")
    throw new Error("Expected screenshot fixture");
  assert.match(evidence.before.image, /^images\/[a-f0-9]+\.png$/);
  assert.deepEqual(
    await readFile(join(input.outputDirectory, evidence.before.image)),
    png,
  );
  assert.ok(html.indexOf("<main") < html.lastIndexOf("<script>"));
});

it("supports empty reports and preserves unrelated destination files", async () => {
  const input = await scenario();
  input.report = emptyReport();
  await mkdir(input.outputDirectory);
  await writeFile(join(input.outputDirectory, "notes.txt"), "User notes");
  await packageReport(input);
  assert.equal(
    await readFile(join(input.outputDirectory, "notes.txt"), "utf8"),
    "User notes",
  );
});

it("refuses existing generated files without leaving partially published output", async () => {
  const input = await scenario();
  await mkdir(input.outputDirectory);
  await writeFile(join(input.outputDirectory, "index.html"), "Existing report");
  await assert.rejects(packageReport(input), /EEXIST/);
  assert.equal(
    await readFile(join(input.outputDirectory, "index.html"), "utf8"),
    "Existing report",
  );
  assert.deepEqual(await readdir(input.outputDirectory), [
    "images",
    "index.html",
  ]);
});

for (const failure of [
  "invalid-report",
  "missing-image",
  "mismatched-dimensions",
  "forged-png",
  "corrupt-png",
  "symlink-escape",
]) {
  it(`rejects ${failure} before publishing a report`, async () => {
    const input = await scenario();
    const evidence = input.report.issues[0].evidence;
    if (evidence.kind !== "screenshot")
      throw new Error("Expected screenshot fixture");
    if (failure === "invalid-report") input.report.review.title = "";
    if (failure === "missing-image")
      await rm(join(input.evidenceDirectory, evidence.before.image));
    if (failure === "mismatched-dimensions")
      evidence.before.imageDimensions.width = 2;
    if (failure === "forged-png")
      await writeFile(
        join(input.evidenceDirectory, evidence.before.image),
        png.subarray(0, 40),
      );
    if (failure === "corrupt-png") {
      const corrupt = Buffer.from(png);
      corrupt[44] ^= 255;
      await writeFile(
        join(input.evidenceDirectory, evidence.before.image),
        corrupt,
      );
    }
    if (failure === "symlink-escape") {
      const escaped = join(root, "outside.png");
      await writeFile(escaped, png);
      await rm(join(input.evidenceDirectory, evidence.before.image));
      await symlink(
        escaped,
        join(input.evidenceDirectory, evidence.before.image),
      );
    }
    await assert.rejects(packageReport(input));
    await assert.rejects(readFile(join(input.outputDirectory, "index.html")));
  });
}

it("rejects an escaping output images symlink and preserves its target", async () => {
  const input = await scenario();
  const outside = await mkdtemp(join(root, "outside-images-"));
  await writeFile(join(outside, "notes.txt"), "Keep me");
  await mkdir(input.outputDirectory);
  await symlink(outside, join(input.outputDirectory, "images"));
  await assert.rejects(packageReport(input), /destination/);
  assert.deepEqual(await readdir(outside), ["notes.txt"]);
});
