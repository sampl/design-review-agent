import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createBrowserConfiguration,
  createCodexLauncher,
  finalizeDesignReviewRun,
  parseReviewInputs,
  prepareDesignReviewRun,
  resolveSourceDirectory,
  runCommand,
} from "./designReview.mjs";

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
  return {
    directory,
    repositoryDirectory,
    outputsFile: path.join(directory, "outputs"),
    pathFile: path.join(directory, "paths"),
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

test("browser configuration returns images, uses isolated Chromium, and enables source delegation", () => {
  const configuration = createBrowserConfiguration({
    browserCliPath: "/action/browser.js",
    evidenceDirectory: "/tmp/evidence",
  });
  assert.match(configuration, /multi_agent = true/);
  assert.match(configuration, /"--image-responses","allow"/);
  assert.match(configuration, /"--output-dir","\/tmp\/evidence"/);
  assert.match(configuration, /required = true/);
  assert.match(configuration, /browser_take_screenshot/);
  assert.match(configuration, /browser_evaluate/);
  assert.doesNotMatch(
    configuration,
    /browser_run_code|browser_file_upload|browser_fill_form/,
  );
});

test("launcher executes exact global Codex path, forwards args, and propagates timeout", async (context) => {
  const { directory } = await fixture();
  const fakeCodex = path.join(directory, "real codex");
  const launcher = path.join(directory, "codex");
  await writeFile(fakeCodex, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
  await chmod(fakeCodex, 0o755);
  await writeFile(launcher, createCodexLauncher(fakeCodex, 1000));
  await chmod(launcher, 0o755);
  const availableTimeout = await runCommand("sh", [
    "-c",
    "command -v timeout || true",
  ]);
  if (!availableTimeout) {
    context.skip("GNU timeout is exercised on the supported Linux runner");
    assert.match(
      await readFile(launcher, "utf8"),
      /timeout --signal=TERM --kill-after=30s 1s/,
    );
    assert.match(await readFile(launcher, "utf8"), /real codex/);
    return;
  }
  assert.equal(
    await runCommand(launcher, ["exec", "--ephemeral", "two words"]),
    "exec\n--ephemeral\ntwo words",
  );
  await writeFile(fakeCodex, "#!/bin/sh\nsleep 5\n");
  await assert.rejects(runCommand(launcher, []), /124/);
});

test("prepare passes generic request to bundled core and keeps raw files outside artifact", async () => {
  const fixturePaths = await fixture();
  const calls = [];
  const state = await prepareDesignReviewRun({
    ...fixturePaths,
    ...inputs,
    sourceScope: "src",
    runnerTemporaryDirectory: fixturePaths.directory,
    run: async (executable, args) => {
      calls.push([executable, args]);
      return args[0] === "prefix" ? "/global" : "";
    },
  });
  const request = JSON.parse(
    await readFile(path.join(state.temporaryDirectory, "request.json"), "utf8"),
  );
  assert.equal(
    request.sourceDirectory,
    path.join(fixturePaths.repositoryDirectory, "src"),
  );
  assert.deepEqual(request.scope, ["/", "/services/"]);
  assert.equal(request.reviewTimeoutMs, 600000);
  assert.equal(calls[0][1][1], "prepare");
  assert.match(
    await readFile(path.join(state.temporaryDirectory, "bin/codex"), "utf8"),
    /'\/global\/bin\/codex'/,
  );
  assert.equal(path.dirname(state.responseFile), state.temporaryDirectory);
  await assert.rejects(
    readFile(path.join(state.artifactDirectory, "index.html")),
    /ENOENT/,
  );
});

test("preparation refuses stale artifact directories", async () => {
  const fixturePaths = await fixture();
  await assert.rejects(
    prepareDesignReviewRun({
      ...fixturePaths,
      ...inputs,
      runnerTemporaryDirectory: fixturePaths.directory,
      requestedArtifactDirectory: ".",
      run: async () => "",
    }),
    /already exists/,
  );
});

async function finalizationFixture(response) {
  const fixturePaths = await fixture();
  const state = {
    temporaryDirectory: fixturePaths.directory,
    artifactDirectory: path.join(fixturePaths.directory, "artifact"),
    contextFile: path.join(fixturePaths.directory, "context.json"),
    responseFile: path.join(fixturePaths.directory, "response.json"),
    coreCliPath: "/core/cli.mjs",
  };
  const stateFile = path.join(fixturePaths.directory, "state.json");
  await writeFile(stateFile, JSON.stringify(state));
  if (response !== undefined)
    await writeFile(state.responseFile, JSON.stringify(response));
  return { ...fixturePaths, stateFile, state };
}

test("execution failure always publishes a diagnostic artifact and never claims complete", async () => {
  const fixturePaths = await finalizationFixture();
  const result = await finalizeDesignReviewRun({
    ...fixturePaths,
    codexOutcome: "failure",
    run: async () => "",
  });
  assert.equal(result.status, "failed");
  const diagnostics = JSON.parse(
    await readFile(
      path.join(fixturePaths.state.artifactDirectory, "run-status.json"),
      "utf8",
    ),
  );
  assert.equal(diagnostics.runIssues[0].code, "agent_execution_failed");
  assert.match(
    await readFile(fixturePaths.outputsFile, "utf8"),
    /review-status=failed/,
  );
});

test("complete findings report succeeds, warnings stay incomplete, invalid reports fail", async () => {
  for (const [runIssues, expected] of [
    [[], "complete"],
    [
      [
        {
          severity: "warning",
          code: "coverage",
          message: "Some states unreachable",
        },
      ],
      "incomplete",
    ],
  ]) {
    const fixturePaths = await finalizationFixture({
      report: { findings: [{ severity: "critical" }] },
      runIssues,
    });
    assert.equal(
      (
        await finalizeDesignReviewRun({
          ...fixturePaths,
          codexOutcome: "success",
          run: async () => "",
        })
      ).status,
      expected,
    );
  }
  const fixturePaths = await finalizationFixture({
    report: null,
    runIssues: [],
  });
  assert.equal(
    (
      await finalizeDesignReviewRun({
        ...fixturePaths,
        codexOutcome: "success",
        run: async () => {
          throw new Error("Report invalid");
        },
      })
    ).status,
    "failed",
  );
});

test("bundled core prepares and packages a real screenshot with the existing viewer", async () => {
  const fixturePaths = await fixture();
  const imageFile = new URL("./fixtures/browser-probe.png", import.meta.url);
  const imageBytes = await readFile(imageFile);
  const width = imageBytes.readUInt32BE(16);
  const height = imageBytes.readUInt32BE(20);
  const state = await prepareDesignReviewRun({
    ...fixturePaths,
    appUrl: inputs.appUrl,
    paths: '["/"]',
    viewports: JSON.stringify([{ width, height }]),
    sourceScope: "src",
    runnerTemporaryDirectory: fixturePaths.directory,
  });
  await copyFile(imageFile, path.join(state.evidenceDirectory, "home.png"));
  await writeFile(
    state.responseFile,
    JSON.stringify({
      report: {
        schemaVersion: "0.1",
        review: {
          title: "Local browser fixture review",
          reviewedAt: "2026-10-27T12:00:00Z",
          baseUrl: inputs.appUrl + "/",
          scope: "Home page",
          evidenceSummary:
            "Inspected real screenshot pixels from the local fixture.",
          areas: [],
          limitations: [],
          outstandingQuestions: [],
        },
        issues: [],
        warnings: [],
      },
      captures: [
        {
          image: "home.png",
          route: "/",
          viewport: { width, height },
          imageDimensions: { width, height },
          scroll: { x: 0, y: 0 },
          state: "Initial page",
        },
      ],
      runIssues: [],
    }),
  );
  const result = await finalizeDesignReviewRun({
    ...fixturePaths,
    stateFile: path.join(state.temporaryDirectory, "state.json"),
    codexOutcome: "success",
  });
  assert.equal(result.status, "complete", JSON.stringify(result));
  const viewer = await readFile(
    path.join(state.artifactDirectory, "index.html"),
    "utf8",
  );
  assert.match(viewer, /design-qa-report/);
  assert.ok(
    (
      await readFile(path.join(state.artifactDirectory, "report.json"), "utf8")
    ).includes("Local browser fixture review"),
  );
  const evidence = JSON.parse(
    await readFile(
      path.join(state.artifactDirectory, "run-evidence.json"),
      "utf8",
    ),
  );
  assert.equal(evidence.captures.length, 1);
  assert.match(evidence.captures[0].image, /^images\//);
  assert.deepEqual(
    await readFile(
      path.join(state.artifactDirectory, evidence.captures[0].image),
    ),
    imageBytes,
  );
});
