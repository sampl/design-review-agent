// Checks asset lookup at the filesystem boundary without starting a review.
import assert from "node:assert/strict";
import { afterAll, beforeAll, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveAssetRoot } from "./assetRoot.ts";

let temporaryRoot: string;
beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "design-qa-assets-"));
});
afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});
async function sharedGuidance(directory: string): Promise<void> {
  await mkdir(join(directory, "agent-prompt"), { recursive: true });
  await writeFile(
    join(directory, "agent-prompt/agent-prompt.md"),
    "Review guidance",
  );
}

it("finds package assets above nested source modules", async () => {
  const packageRoot = join(temporaryRoot, "source");
  await sharedGuidance(packageRoot);
  const moduleUrl = pathToFileURL(join(packageRoot, "run-review/assetRoot.ts"));
  assert.equal(
    (await resolveAssetRoot(moduleUrl.href)).href,
    pathToFileURL(`${packageRoot}/`).href,
  );
});

it("uses a bundle's own assets even when its parent also has guidance", async () => {
  const parentRoot = join(temporaryRoot, "distribution");
  const bundleRoot = join(parentRoot, "core");
  await sharedGuidance(parentRoot);
  await sharedGuidance(bundleRoot);
  assert.equal(
    (await resolveAssetRoot(pathToFileURL(join(bundleRoot, "index.mjs")).href))
      .href,
    pathToFileURL(`${bundleRoot}/`).href,
  );
});

it("rejects layouts with no shared guidance instead of using the working directory", async () => {
  const moduleUrl = pathToFileURL(join(temporaryRoot, "missing/module.mjs"));
  await assert.rejects(
    resolveAssetRoot(moduleUrl.href),
    /assets could not be located/,
  );
});
