import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
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
} from "./designReview.mjs";
import { LINUX_DROP_SUDO_SCRIPT } from "./isolate.ts";

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
  for (const status of ["complete", "incomplete"]) {
    const paths = await fixture();
    const runIssues =
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
      review: async (request, outputDirectory, options) => {
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
        return { status, runIssues, outputDirectory, report: { issues: [] } };
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
  const runIssues = [
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
  const artifactDirectory = outputs.match(
    /design-qa-artifact-directory-path=(.+)/,
  )[1];
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
  const artifactDirectory = outputs.match(
    /design-qa-artifact-directory-path=(.+)/,
  )[1];
  assert.doesNotMatch(
    await readFile(path.join(artifactDirectory, "run-status.json"), "utf8"),
    /private text/,
  );
});

test("rejects stale report destinations and invalid proxy metadata before launching core", async () => {
  const paths = await fixture();
  let invoked = false;
  const review = async () => {
    invoked = true;
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
  await writeFile(paths.proxyInformationFile, JSON.stringify({ port: "bad" }));
  await assert.rejects(
    runDesignReviewAction({ ...paths, ...inputs, review }),
    /proxy port/,
  );
  assert.equal(invoked, false);
});

test("Action browser lockfile inputs match the bundled core runtime requirements", async () => {
  const requirements = await runtimeRequirements();
  assert.match(requirements.codex, /^\d+\.\d+\.\d+$/);
});

test("uses upstream setup only and the exact pinned Linux privilege boundary", async () => {
  const action = await readFile(
    new URL("../action.yml", import.meta.url),
    "utf8",
  );
  assert.match(action, /Set up protected Codex authentication/);
  assert.doesNotMatch(action, /prompt-file:|codex-args:|output-file:/);
  assert.match(action, /scripts\/isolate\.ts/);
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
    .replace('"./linuxCredentials.ts"', '"./linuxCredentials"');
  assert.equal(
    createHash("sha256").update(normalized).digest("hex"),
    "739e6b11444f71b8594e604d2712c07dc5d8cdf6a70767c8d078831bbe498bd4",
  );
});

test("normal bundled core rejects invalid review requests without launching a model", async () => {
  const paths = await fixture();
  const { ReviewError } = await import("../dist/core/index.mjs");
  await assert.rejects(
    runDesignReviewAction({ ...paths, ...inputs, paths: '["/","/"]' }),
    (error) => error instanceof ReviewError && error.code === "invalid-request",
  );
  const outputs = await readFile(paths.outputsFile, "utf8");
  const artifactDirectory = outputs.match(
    /design-qa-artifact-directory-path=(.+)/,
  )[1];
  const diagnostic = JSON.parse(
    await readFile(path.join(artifactDirectory, "run-status.json"), "utf8"),
  );
  assert.equal(diagnostic.status, "failed");
  assert.equal(diagnostic.runIssues[0].code, "invalid-request");
});

test("cancellation reaches core and remains a failed diagnostic outcome", async () => {
  const paths = await fixture();
  const controller = new AbortController();
  const runIssues = [
    { severity: "error", code: "cancelled", message: "Review cancelled" },
  ];
  const pending = runDesignReviewAction({
    ...paths,
    ...inputs,
    signal: controller.signal,
    review: async (_request, _outputDirectory, { signal }) => {
      assert.equal(signal, controller.signal);
      return await new Promise((_resolve, reject) => {
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
  await assert.rejects(pending, (error) => error.code === "cancelled");
  assert.match(
    await readFile(paths.outputsFile, "utf8"),
    /review-status=failed/,
  );
});

test("outer launcher forwards cancellation to sudo and removes handlers after exit", async () => {
  const { EventEmitter } = await import("node:events");
  const { forwardCancellation } = await import("./isolate.ts");
  const signalSource = new EventEmitter();
  const child = new EventEmitter();
  const forwarded = [];
  child.kill = (signal) => forwarded.push(signal);
  forwardCancellation(child, signalSource);
  signalSource.emit("SIGINT");
  signalSource.emit("SIGTERM");
  assert.deepEqual(forwarded, ["SIGINT", "SIGTERM"]);
  child.emit("exit", 130);
  assert.equal(signalSource.listenerCount("SIGINT"), 0);
  assert.equal(signalSource.listenerCount("SIGTERM"), 0);
});

test("documented Action defaults stay aligned with the core defaults", async () => {
  const { reviewDefaults } = await import("../dist/core/index.mjs");
  const parsed = parseReviewInputs({ appUrl: inputs.appUrl });
  assert.deepEqual(parsed.scope, [...reviewDefaults.scope]);
  assert.deepEqual(parsed.viewports, reviewDefaults.viewports);
  assert.equal(parsed.reviewTimeoutMs, reviewDefaults.reviewTimeoutMs);
  const action = await readFile(
    new URL("../action.yml", import.meta.url),
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
