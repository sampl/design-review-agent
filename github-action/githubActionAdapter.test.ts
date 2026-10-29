// Tests Action mapping and the generated runtime without model or privileged calls.
import { ChildProcess, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ReviewResult, RunIssue } from "../core/index.ts";
import {
  fixtureValue,
  emptyReport,
} from "../core/report-format/fixtures/contract.ts";
import { loadBundledCore } from "./bundledCore.ts";
import { beforeAll, test } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  parseReviewInputs,
  resolveSourceDirectory,
  runDesignReviewAction,
  runtimeRequirements,
} from "./githubActionAdapter.ts";
import { LINUX_DROP_SUDO_SCRIPT } from "./isolate.ts";

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./build-scripts/buildBundle.ts", import.meta.url))],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}, 30000);

const inputs = {
  appUrl: "http://127.0.0.1:4321",
  paths: '["/","/services/"]',
  viewports: '[{"width":390,"height":844}]',
};
async function fixture() {
  const directory = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "review-test-")),
  );
  const repositoryDirectory = path.join(directory, "repository");
  await mkdir(repositoryDirectory);
  await mkdir(path.join(repositoryDirectory, "src"));
  const proxyInformationFile = path.join(directory, "proxy.json");
  await writeFile(proxyInformationFile, JSON.stringify({ port: 12345 }));
  return {
    directory,
    repositoryDirectory,
    runnerTemporaryDirectory: directory,
    proxyInformationFile,
    outputsFile: path.join(directory, "outputs"),
  };
}
test("validates explicit route, viewport, URL, and timeout inputs", () => {
  assert.deepEqual(parseReviewInputs(inputs).scope, ["/", "/services/"]);
  for (const invalid of [
    { appUrl: "file:///tmp/a" },
    { appUrl: "http://user:pass@localhost" },
    { appUrl: "http://localhost/?token=secret" },
    { paths: '["https://other.test"]' },
    { paths: '["//other.test"]' },
    { paths: "[]" },
    { paths: "[null]" },
    { paths: "{}" },
    { viewports: "null" },
    { viewports: "[null]" },
    { viewports: '[{"width":"390","height":844}]' },
    { viewports: '[{"width":1,"height":844}]' },
    { viewports: '[{"width":390,"height":844,"extra":true}]' },
    { timeoutMinutes: "0" },
    { timeoutMinutes: "2.5" },
    { timeoutMinutes: "31" },
  ])
    assert.throws(() => parseReviewInputs({ ...inputs, ...invalid }));
});

test("rejects traversal, environment scopes, and escaped symlinks", async () => {
  const { directory, repositoryDirectory } = await fixture();
  assert.equal(
    await resolveSourceDirectory(repositoryDirectory, "src"),
    path.join(repositoryDirectory, "src"),
  );
  for (const invalid of [
    "../",
    ".git",
    ".env",
    "src/../",
    "/tmp",
    "src\\child",
    "src\n",
  ])
    await assert.rejects(resolveSourceDirectory(repositoryDirectory, invalid));
  await symlink(directory, path.join(repositoryDirectory, "outside"));
  await assert.rejects(
    resolveSourceDirectory(repositoryDirectory, "outside"),
    /outside/,
  );
});

test("maps GitHub inputs to the normal core entry point and preserves core outcomes", async () => {
  for (const status of ["complete", "incomplete"] as const) {
    const paths = await fixture();
    const runIssues: RunIssue[] =
      status === "incomplete"
        ? [
            {
              severity: "warning",
              code: "coverage",
              message: "Some states unreachable",
            },
          ]
        : [];
    const result = await runDesignReviewAction({
      ...paths,
      ...inputs,
      sourceScope: "src",
      review: async (request, outputDirectory, options = {}) => {
        assert.equal(
          request.sourceDirectory,
          path.join(paths.repositoryDirectory, "src"),
        );
        assert.deepEqual(request.scope, ["/", "/services/"]);
        assert.deepEqual(request.viewports, [{ width: 390, height: 844 }]);
        assert.equal(request.reviewTimeoutMs, 600000);
        assert.equal(options.responsesProxyUrl, "http://127.0.0.1:12345/v1");
        assert.ok(path.isAbsolute(request.evidenceDirectory));
        assert.notEqual(request.evidenceDirectory, outputDirectory);
        return { status, runIssues, outputDirectory, report: emptyReport() };
      },
    });
    assert.equal(result.status, status);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(result.outputDirectory, "run-status.json"),
          "utf8",
        ),
      ),
      { status, runIssues },
    );
    assert.match(
      await readFile(paths.outputsFile, "utf8"),
      new RegExp(`review-status=${status}`),
    );
  }
});

test("typed core failures produce diagnostic artifacts and remain failures", async () => {
  const paths = await fixture();
  const runIssues: RunIssue[] = [
    {
      severity: "error",
      code: "agent-timeout",
      message: "Review execution timed out",
    },
  ];
  const failure = Object.assign(new Error("Review execution timed out"), {
    code: "agent-timeout",
    runIssues,
  });
  await assert.rejects(
    runDesignReviewAction({
      ...paths,
      ...inputs,
      review: async () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  const outputs = await readFile(paths.outputsFile, "utf8");
  const artifactMatch = outputs.match(/design-qa-artifact-directory-path=(.+)/);
  assert.ok(artifactMatch);
  const artifactDirectory = fixtureValue(artifactMatch[1]);
  assert.deepEqual(
    JSON.parse(
      await readFile(path.join(artifactDirectory, "run-status.json"), "utf8"),
    ),
    { status: "failed", runIssues },
  );
  assert.match(outputs, /review-status=failed/);
  await assert.rejects(
    readFile(path.join(artifactDirectory, "index.html")),
    /ENOENT/,
  );
});

test("unexpected failures do not copy raw errors or model output into diagnostics", async () => {
  const paths = await fixture();
  await assert.rejects(
    runDesignReviewAction({
      ...paths,
      ...inputs,
      review: async () => {
        throw new Error("raw response private text");
      },
    }),
  );
  const outputs = await readFile(paths.outputsFile, "utf8");
  const artifactMatch = outputs.match(/design-qa-artifact-directory-path=(.+)/);
  assert.ok(artifactMatch);
  const artifactDirectory = fixtureValue(artifactMatch[1]);
  assert.doesNotMatch(
    await readFile(path.join(artifactDirectory, "run-status.json"), "utf8"),
    /private text/,
  );
});

test("malformed failure details use the generic diagnostic without leaking raw values", async () => {
  const paths = await fixture();
  const failure = Object.assign(new Error("private raw failure"), {
    runIssues: [
      { severity: "unexpected", code: "private", message: "private text" },
    ],
  });
  await assert.rejects(
    runDesignReviewAction({
      ...paths,
      ...inputs,
      review: async () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  const outputs = await readFile(paths.outputsFile, "utf8");
  const artifactMatch = outputs.match(/design-qa-artifact-directory-path=(.+)/);
  assert.ok(artifactMatch);
  const diagnostic = await readFile(
    path.join(fixtureValue(artifactMatch[1]), "run-status.json"),
    "utf8",
  );
  assert.match(diagnostic, /review-execution-failed/);
  assert.doesNotMatch(diagnostic, /private/);
});

test("rejects stale report destinations and invalid proxy metadata before launching core", async () => {
  const paths = await fixture();
  let invoked = false;
  const review = async (): Promise<ReviewResult> => {
    invoked = true;
    throw new Error("Core must not be invoked for invalid setup.");
  };
  await assert.rejects(
    runDesignReviewAction({
      ...paths,
      ...inputs,
      requestedArtifactDirectory: paths.repositoryDirectory,
      review,
    }),
    /already exists/,
  );
  for (const metadata of [
    null,
    {},
    { port: "bad" },
    { port: 0 },
    { port: 65536 },
  ]) {
    await writeFile(paths.proxyInformationFile, JSON.stringify(metadata));
    await assert.rejects(
      runDesignReviewAction({ ...paths, ...inputs, review }),
      /proxy port/,
    );
  }
  assert.equal(invoked, false);
});

test("Action browser lockfile inputs match the bundled core runtime requirements", async () => {
  const requirements = await runtimeRequirements();
  assert.match(requirements.codex, /^\d+\.\d+\.\d+$/);
});

test("uses upstream setup only and the exact pinned Linux privilege boundary", async () => {
  const action = await readFile(
    new URL("./action.yml", import.meta.url),
    "utf8",
  );
  assert.match(action, /Set up protected Codex authentication/);
  assert.doesNotMatch(action, /prompt-file:|codex-args:|output-file:/);
  assert.match(action, /isolate\.ts/);
  assert.match(action, /steps\.review\.outputs\.review-status/);
  // A digest makes unreviewed edits to upstream's root/setpriv sequence fail loudly.
  assert.equal(
    createHash("sha256").update(LINUX_DROP_SUDO_SCRIPT).digest("hex"),
    "263d62342d80486801c2612c9f5d2fde02ae7d8d587d6d9887e329a45f375177",
  );
  const credentials = await readFile(
    new URL(
      "./vendor/openai-codex-action/linuxCredentials.ts",
      import.meta.url,
    ),
  );
  assert.equal(
    createHash("sha256").update(credentials).digest("hex"),
    "aa75358ce28991c1fc20db9c177848b40a7ebd840ad1e5b095f93552c55301fe",
  );
  const dropSudo = await readFile(
    new URL("./vendor/openai-codex-action/dropSudo.ts", import.meta.url),
    "utf8",
  );
  const normalized = dropSudo
    .replace("  type LinuxRunnerCredentials,", "  LinuxRunnerCredentials,")
    .replace('"./linuxCredentials.ts"', '"./linuxCredentials"')
    .replace(
      "const scriptPath = process.argv[1]!;",
      "const scriptPath = process.argv[1];",
    )
    .replace("name: names[index]!,", "name: names[index],");
  assert.equal(
    createHash("sha256").update(normalized).digest("hex"),
    "739e6b11444f71b8594e604d2712c07dc5d8cdf6a70767c8d078831bbe498bd4",
  );
});

test("normal bundled core rejects invalid review requests without launching a model", async () => {
  const paths = await fixture();
  const { ReviewError } = await loadBundledCore();
  await assert.rejects(
    runDesignReviewAction({ ...paths, ...inputs, paths: '["/","/"]' }),
    (error) => error instanceof ReviewError && error.code === "invalid-request",
  );
  const outputs = await readFile(paths.outputsFile, "utf8");
  const artifactMatch = outputs.match(/design-qa-artifact-directory-path=(.+)/);
  assert.ok(artifactMatch);
  const artifactDirectory = fixtureValue(artifactMatch[1]);
  const diagnostic = JSON.parse(
    await readFile(path.join(artifactDirectory, "run-status.json"), "utf8"),
  );
  assert.equal(diagnostic.status, "failed");
  assert.equal(diagnostic.runIssues[0].code, "invalid-request");
});

test("cancellation reaches core and remains a failed diagnostic outcome", async () => {
  const paths = await fixture();
  const controller = new AbortController();
  const runIssues: RunIssue[] = [
    { severity: "error", code: "cancelled", message: "Review cancelled" },
  ];
  const pending = runDesignReviewAction({
    ...paths,
    ...inputs,
    signal: controller.signal,
    review: async (_request, _outputDirectory, { signal } = {}) => {
      assert.ok(signal);
      assert.equal(signal, controller.signal);
      return await new Promise<ReviewResult>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () =>
            reject(
              Object.assign(new Error("Review cancelled"), {
                code: "cancelled",
                runIssues,
              }),
            ),
          { once: true },
        );
        controller.abort();
      });
    },
  });
  await assert.rejects(
    pending,
    (error) =>
      error instanceof Error && "code" in error && error.code === "cancelled",
  );
  assert.match(
    await readFile(paths.outputsFile, "utf8"),
    /review-status=failed/,
  );
});

test("outer launcher forwards cancellation to sudo and removes handlers after exit", async () => {
  const { EventEmitter } = await import("node:events");
  const { forwardCancellation } = await import("./isolate.ts");
  const signalSource = new EventEmitter();
  const forwarded: (NodeJS.Signals | number | undefined)[] = [];
  const child = Object.assign(new ChildProcess(), {
    kill: (signal?: NodeJS.Signals | number) => {
      forwarded.push(signal);
      return true;
    },
  }) satisfies Pick<ChildProcess, "once" | "kill">;
  forwardCancellation(child, signalSource);
  signalSource.emit("SIGINT");
  signalSource.emit("SIGTERM");
  assert.deepEqual(forwarded, ["SIGINT", "SIGTERM"]);
  child.emit("exit", 130);
  assert.equal(signalSource.listenerCount("SIGINT"), 0);
  assert.equal(signalSource.listenerCount("SIGTERM"), 0);
});

test("documented Action defaults stay aligned with the core defaults", async () => {
  const { reviewDefaults } = await loadBundledCore();
  const parsed = parseReviewInputs({ appUrl: inputs.appUrl });
  assert.deepEqual(parsed.scope, [...reviewDefaults.scope]);
  assert.deepEqual(parsed.viewports, reviewDefaults.viewports);
  assert.equal(parsed.reviewTimeoutMs, reviewDefaults.reviewTimeoutMs);
  const action = await readFile(
    new URL("./action.yml", import.meta.url),
    "utf8",
  );
  assert.ok(
    action.includes(`default: '${JSON.stringify(reviewDefaults.scope)}'`),
  );
  assert.ok(
    action.includes(`default: '${JSON.stringify(reviewDefaults.viewports)}'`),
  );
  assert.ok(
    action.includes(`default: "${reviewDefaults.reviewTimeoutMs / 60000}"`),
  );
});

test("rejects malformed Action command arguments before setup or review", () => {
  for (const args of [
    ["runtime"],
    ["runtime", "one"],
    ["runtime", "one", "two", "extra"],
    ["run"],
    ["run", "one"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./githubActionAdapter.ts", import.meta.url)),
        ...args,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Expected runtime OUTPUT_FILE TEMP_DIRECTORY|Expected 11 run arguments/,
    );
  }
});

test("the generated bundle exposes the expected runtime exports", async () => {
  const core = await loadBundledCore();
  assert.deepEqual(Object.keys(core).sort(), [
    "ReviewError",
    "installBrowser",
    "reviewDefaults",
    "runReview",
  ]);
  assert.equal(typeof core.installBrowser, "function");
  const manifest = JSON.parse(
    await readFile(
      new URL("./dist/core/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal("cli.mjs" in manifest.files, false);
  await assert.rejects(
    readFile(new URL("./dist/core/cli.mjs", import.meta.url)),
    { code: "ENOENT" },
  );
  assert.equal(typeof core.runReview, "function");
  assert.equal(typeof core.ReviewError, "function");
});

test("builds a downloaded Action without Git metadata from an unrelated directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "action-build-test-"));
  const repository = fileURLToPath(new URL("../", import.meta.url));
  try {
    for (const name of [
      "core",
      "github-action/build-scripts",
      "package.json",
    ]) {
      await cp(path.join(repository, name), path.join(directory, name), {
        recursive: true,
        filter: (source) =>
          !["node_modules", "dist"].includes(path.basename(source)),
      });
    }
    await symlink(
      path.join(repository, "node_modules"),
      path.join(directory, "node_modules"),
    );
    await symlink(
      path.join(repository, "core/node_modules"),
      path.join(directory, "core/node_modules"),
    );
    const result = spawnSync(
      process.execPath,
      [path.join(directory, "github-action/build-scripts/buildBundle.ts")],
      {
        cwd: repository,
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const output = path.join(directory, "github-action/dist/core");
    const manifest = JSON.parse(
      await readFile(path.join(output, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.sourceCommit, null);
    assert.equal(manifest.sourceDirty, null);
    for (const [filename, digest] of Object.entries(manifest.files)) {
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(output, filename)))
          .digest("hex"),
        digest,
      );
    }
    for (const filename of [
      "index.mjs",
      "runtimeRequirements.json",
      "agent-prompt/agent-prompt.md",
      "viewer/index.html",
      "viewer/viewer.js",
      "viewer/report.schema.json",
    ]) {
      assert.ok(filename in manifest.files, filename);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
