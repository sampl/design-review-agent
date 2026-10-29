// Verifies local input mapping, report delivery, and failure recovery at the core boundary.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { ReviewError, type ReviewRequest } from "design-review-agent-core";
import { runCli } from "./runCli.ts";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "design-review-cli-test-"));
  const messages: string[] = [];
  return {
    directory,
    output: join(directory, "report"),
    messages,
    context: {
      cwd: directory,
      write: (message: string) => messages.push(message),
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test("maps local inputs to the normal core flow and preserves incomplete results", async () => {
  const setup = await fixture();
  try {
    const controller = new AbortController();
    let receivedRequest: ReviewRequest | undefined;
    let workingEvidence = "";
    const code = await runCli(
      [
        "--app-url",
        "http://localhost:4321",
        "--source",
        "app",
        "--output",
        "report",
        "--route",
        "/",
        "--route",
        "/settings",
        "--viewport",
        "800x600",
        "--focus",
        "Review navigation",
        "--timeout-minutes",
        "2",
      ],
      {
        ...setup.context,
        signal: controller.signal,
        review: async (request, outputDirectory, options) => {
          receivedRequest = request;
          workingEvidence = request.evidenceDirectory;
          assert.equal(outputDirectory, setup.output);
          assert.equal(options?.signal, controller.signal);
          return {
            report: {
              schemaVersion: "0.1",
              review: {
                title: "Synthetic review",
                reviewedAt: "2026-10-28T12:00:00Z",
                scope: "Synthetic scope",
                evidenceSummary: "Synthetic test",
                areas: [],
                limitations: [],
                outstandingQuestions: [],
              },
              issues: [],
              warnings: [],
            },
            outputDirectory,
            status: "incomplete",
            runIssues: [
              {
                severity: "warning",
                code: "coverage",
                message: "Partial coverage",
              },
            ],
          };
        },
      },
    );
    assert.equal(code, 0);
    assert.equal(
      receivedRequest?.sourceDirectory,
      join(setup.directory, "app"),
    );
    assert.deepEqual(receivedRequest?.scope, ["/", "/settings"]);
    assert.deepEqual(receivedRequest?.viewports, [{ width: 800, height: 600 }]);
    assert.equal(receivedRequest?.reviewTimeoutMs, 120000);
    assert.equal(receivedRequest?.instructions, "Review navigation");
    assert.equal(JSON.parse(setup.messages.at(-1)!).status, "incomplete");
    await assert.rejects(stat(workingEvidence), {
      code: "ENOENT",
    });
  } finally {
    await setup.cleanup();
  }
});

test("refuses an existing output directory without invoking core", async () => {
  const setup = await fixture();
  try {
    await mkdir(setup.output);
    let called = false;
    assert.equal(
      await runCli(["--app-url", "http://localhost", "--output", "report"], {
        ...setup.context,
        review: async () => {
          called = true;
          throw new Error("Unexpected core call");
        },
      }),
      1,
    );
    assert.equal(called, false);
    assert.match(setup.messages.join(""), /new output directory/);
  } finally {
    await setup.cleanup();
  }
});

test("writes a core failure diagnostic without a misleading report", async () => {
  const setup = await fixture();
  try {
    const code = await runCli(
      ["--app-url", "http://localhost", "--output", "report"],
      {
        ...setup.context,
        review: async () => {
          throw new ReviewError("runtime-unavailable", "Codex CLI unavailable");
        },
      },
    );
    assert.equal(code, 1);
    const diagnostic = JSON.parse(
      await readFile(join(setup.output, "run-status.json"), "utf8"),
    );
    assert.equal(diagnostic.status, "failed");
    assert.equal(diagnostic.code, "runtime-unavailable");
    await assert.rejects(readFile(join(setup.output, "report.json")), {
      code: "ENOENT",
    });
  } finally {
    await setup.cleanup();
  }
});

test("returns cancellation status and help does not invoke core", async () => {
  const setup = await fixture();
  try {
    assert.equal(
      await runCli(["--help"], {
        ...setup.context,
        review: async () => {
          throw new Error("Unexpected core call");
        },
      }),
      0,
    );
    const controller = new AbortController();
    controller.abort();
    assert.equal(
      await runCli(["--app-url", "http://localhost", "--output", "report"], {
        ...setup.context,
        signal: controller.signal,
        review: async () => {
          throw new ReviewError("cancelled", "Review cancelled");
        },
      }),
      130,
    );
  } finally {
    await setup.cleanup();
  }
});

test("rejects malformed and unknown flags before invoking core", async () => {
  for (const invalidArguments of [
    ["--viewport", "wide"],
    ["--timeout-minutes", "0"],
    ["--unknown", "value"],
  ]) {
    const setup = await fixture();
    try {
      assert.equal(
        await runCli(
          [
            "--app-url",
            "http://localhost",
            "--output",
            "report",
            ...invalidArguments,
          ],
          {
            ...setup.context,
            review: async () => {
              throw new Error("Unexpected core call");
            },
          },
        ),
        1,
      );
      await assert.rejects(readFile(join(setup.output, "run-status.json")), {
        code: "ENOENT",
      });
    } finally {
      await setup.cleanup();
    }
  }
});

test("installs the browser with the caller signal without starting a review or creating reports", async () => {
  const setup = await fixture();
  try {
    const controller = new AbortController();
    let installationCalls = 0;
    let reviewCalls = 0;
    const code = await runCli(["install-browser"], {
      ...setup.context,
      signal: controller.signal,
      installBrowser: async (signal) => {
        installationCalls++;
        assert.equal(signal, controller.signal);
        assert.deepEqual(await readdir(setup.directory), []);
      },
      review: async () => {
        reviewCalls++;
        throw new Error("Unexpected review");
      },
    });
    assert.equal(code, 0);
    assert.equal(installationCalls, 1);
    assert.equal(reviewCalls, 0);
    assert.deepEqual(await readdir(setup.directory), []);
    assert.deepEqual(setup.messages, []);
  } finally {
    await setup.cleanup();
  }
});

test("reports installation failure and cancellation without report diagnostics", async () => {
  for (const cancelled of [false, true]) {
    const setup = await fixture();
    try {
      const controller = new AbortController();
      const code = await runCli(["install-browser"], {
        ...setup.context,
        signal: controller.signal,
        installBrowser: async (signal) => {
          if (cancelled) {
            controller.abort();
            assert.equal(signal?.aborted, true);
          }
          throw new Error("Installation stopped");
        },
      });
      assert.equal(code, cancelled ? 130 : 1);
      assert.equal(JSON.parse(setup.messages.at(-1)!).status, "failed");
      assert.deepEqual(await readdir(setup.directory), []);
    } finally {
      await setup.cleanup();
    }
  }
});

test("installation help and invalid arguments never invoke the installer", async () => {
  for (const [args, expectedCode] of [
    [["--help"], 0],
    [["install-browser", "--help"], 0],
    [["install-browser", "-h"], 0],
    [["install-browser", "extra"], 1],
    [["install-browser", "--unknown"], 1],
    [["install-browser", "--output", "report"], 1],
    [["install-browser", "--app-url", "http://localhost"], 1],
  ] as const) {
    const setup = await fixture();
    try {
      let installationCalls = 0;
      const code = await runCli([...args], {
        ...setup.context,
        installBrowser: async () => {
          installationCalls++;
        },
      });
      assert.equal(code, expectedCode);
      assert.equal(installationCalls, 0);
      if (expectedCode === 0)
        assert.match(setup.messages[0]!, /install-browser/);
      assert.deepEqual(await readdir(setup.directory), []);
    } finally {
      await setup.cleanup();
    }
  }
});
