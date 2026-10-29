// Builds a versioned, self-contained core bundle for the GitHub Action in this workspace.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildViewer } from "../../core/build-scripts/buildViewer.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const packageDirectory = fileURLToPath(new URL("../../core/", import.meta.url));
const { values } = parseArgs({ options: { output: { type: "string" } } });
const output = resolve(
  values.output ?? fileURLToPath(new URL("../dist/core", import.meta.url)),
);
if (basename(output) !== "core" || output === packageDirectory)
  throw new Error("Bundle output must be a dedicated directory named core.");

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        if (entry.isSymbolicLink())
          throw new Error("Bundle directories must not contain symlinks.");
        return entry.isDirectory()
          ? (await files(join(directory, entry.name))).map(
              (filename) => `${entry.name}/${filename}`,
            )
          : [entry.name];
      }),
  );
  return paths.flat();
}

await mkdir(dirname(output), { recursive: true });
const staging = await mkdtemp(join(dirname(output), ".design-qa-core-"));
try {
  await build({
    entryPoints: [join(packageDirectory, "index.ts")],
    outfile: join(staging, "index.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    packages: "bundle",
    banner: {
      js: 'import { createRequire as __coreCreateRequire } from "node:module"; const require = __coreCreateRequire(import.meta.url);',
    },
  });
  await buildViewer(join(staging, "viewer"));
  await cp(
    join(packageDirectory, "agent-prompt"),
    join(staging, "agent-prompt"),
    { recursive: true },
  );
  // Source module names changed; preserve the Action bundle's existing guidance layout.
  const bundledPromptPath = join(staging, "agent-prompt/agent-prompt.md");
  await writeFile(
    bundledPromptPath,
    (await readFile(bundledPromptPath, "utf8")).replaceAll(
      "../report-format/README.md",
      "../report/README.md",
    ),
  );
  await writeFile(
    join(staging, "README.md"),
    (await readFile(join(packageDirectory, "README.md"), "utf8")).replaceAll(
      "report-format/README.md",
      "report/README.md",
    ),
  );
  for (const moduleName of [
    "build-scripts",
    "codex-runtime",
    "html-viewer",
    "run-review",
  ]) {
    await mkdir(join(staging, moduleName));
    await cp(
      join(packageDirectory, moduleName, "README.md"),
      join(staging, moduleName, "README.md"),
    );
  }
  await cp(
    join(packageDirectory, "codex-runtime/runtimeRequirements.json"),
    join(staging, "runtimeRequirements.json"),
  );
  await mkdir(join(staging, "report"));
  await cp(
    join(packageDirectory, "report-format/README.md"),
    join(staging, "report/README.md"),
  );
  // Source inventories link to development files that are intentionally absent from the bundle.
  // Keep guidance links local, and render omitted source references as plain labels.
  for (const filename of (await files(staging)).filter((name) =>
    name.endsWith(".md"),
  )) {
    const documentPath = join(staging, filename);
    const document = await readFile(documentPath, "utf8");
    const links = [...document.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    let bundledDocument = document;
    for (const match of links) {
      const markup = match[0];
      const label = match[1]!;
      const target = match[2]!;
      if (/^[a-z]+:|^#/i.test(target)) continue;
      try {
        await readFile(resolve(dirname(documentPath), target.split("#")[0]!));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        bundledDocument = bundledDocument.replaceAll(markup, label);
      }
    }
    await writeFile(documentPath, bundledDocument);
  }
  const packageData = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8"),
  ) as { version: string };
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryDirectory,
    encoding: "utf8",
  }).trim();
  const sourceStatus = execFileSync(
    "git",
    [
      "status",
      "--porcelain",
      "--",
      "core/",
      "github-action/build-scripts/",
      "package.json",
      "github-action/package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ],
    { cwd: repositoryDirectory, encoding: "utf8" },
  ).trim();
  const digests: Record<string, string> = {};
  for (const filename of await files(staging))
    digests[filename] = createHash("sha256")
      .update(await readFile(join(staging, filename)))
      .digest("hex");
  await writeFile(
    join(staging, "manifest.json"),
    JSON.stringify(
      {
        package: "design-review-agent-core",
        version: packageData.version,
        sourceRepository: "sampl/design-review-agent",
        sourceDirectory: "core",
        sourceCommit,
        sourceDirty: sourceStatus !== "",
        files: digests,
      },
      null,
      2,
    ),
  );
  let existing: string[] = [];
  try {
    existing = await files(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing.length) {
    const manifest = JSON.parse(
      await readFile(join(output, "manifest.json"), "utf8"),
    ) as { package?: string; files?: Record<string, string> };
    if (
      manifest.package !== "design-review-agent-core" ||
      !manifest.files ||
      existing.some(
        (filename) =>
          filename !== "manifest.json" && !(filename in manifest.files!),
      )
    )
      throw new Error(
        "Bundle output contains unrelated files; refusing to replace it.",
      );
    for (const filename of existing.filter(
      (filename) => filename !== "manifest.json",
    )) {
      const digest = createHash("sha256")
        .update(await readFile(join(output, filename)))
        .digest("hex");
      if (manifest.files[filename] !== digest)
        throw new Error(`Bundle file has local edits: ${filename}`);
    }
  }
  const backup = `${staging}-previous`;
  let backedUp = false;
  try {
    try {
      await rename(output, backup);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(staging, output);
  } catch (error) {
    if (backedUp) await rename(backup, output);
    throw error;
  }
  if (backedUp) await rm(backup, { recursive: true });
  console.info(
    `◈ Core bundle written to ${relative(process.cwd(), output)} (${sourceCommit}, sourceDirty=${sourceStatus !== ""}).`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
