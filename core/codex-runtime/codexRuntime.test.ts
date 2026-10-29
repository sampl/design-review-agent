// Exercises actual subprocess transport without invoking a model or real browser.
import assert from "node:assert/strict";
import { afterAll, beforeAll, it } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { executeCodex, runtimeRequirements } from "./codexRuntime.ts";
import { ReviewError } from "../run-review/reviewError.ts";
import type { PreparedReview } from "../run-review/runReview.ts";

let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "design-qa-process-"));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function prepared(): PreparedReview {
  return {
    context: {
      version: 1,
      preparedAt: new Date().toISOString(),
      request: {
        appUrl: "http://localhost:3000",
        sourceDirectory: directory,
        evidenceDirectory: directory,
        scope: ["/"],
        viewports: [{ width: 1440, height: 900 }],
      },
    },
    prompt: "Inspect this synthetic app.",
    responseSchema: {} as PreparedReview["responseSchema"],
  };
}

async function executable(
  name: string,
  body: string,
  version = runtimeRequirements.codex,
) {
  const filename = join(directory, name);
  await writeFile(
    filename,
    `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nimport { spawn } from 'node:child_process';\nif (process.argv[2] === '--version') { console.log('codex-cli ${version}'); process.exit(0); }\n${body}\n`,
  );
  await chmod(filename, 0o755);
  return filename;
}

it("launches one read-only runtime with isolated pixel-returning browser and plain JSON transport", async () => {
  const invocationFile = join(directory, "invocation.json");
  const sourceMarker = join(directory, "product-source.txt");
  await writeFile(sourceMarker, "Existing source must stay intact.");
  const fakeCodex = await executable(
    "success.mjs",
    `
    let prompt = ''; process.stdin.on('data', chunk => prompt += chunk);
    process.stdin.on('end', () => {
      writeFileSync(${JSON.stringify(invocationFile)}, JSON.stringify({args: process.argv.slice(2), prompt}));
      writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], JSON.stringify({report: null, runIssues: [], captures: []}));
    });
  `,
  );
  const result = await executeCodex(
    prepared(),
    new AbortController().signal,
    undefined,
    { executable: fakeCodex, browserCli: "/synthetic/browser-cli.js" },
  );
  assert.deepEqual(result, { report: null, runIssues: [], captures: [] });
  const invocation = JSON.parse(await readFile(invocationFile, "utf8")) as {
    args: string[];
    prompt: string;
  };
  assert.ok(invocation.prompt.startsWith(prepared().prompt));
  assert.match(invocation.prompt, /omit filename to receive both image pixels/);
  assert.ok(invocation.args.includes("--ignore-user-config"));
  assert.ok(invocation.args.includes("--ignore-rules"));
  assert.ok(invocation.args.includes("--skip-git-repo-check"));
  assert.notEqual(
    invocation.args[invocation.args.indexOf("--cd") + 1],
    directory,
  );
  assert.match(
    invocation.prompt,
    /Read its applicable ancestor and source AGENTS.md/,
  );
  assert.equal(invocation.args.includes("--ephemeral"), false);
  assert.equal(
    invocation.args[invocation.args.indexOf("--sandbox") + 1],
    "read-only",
  );
  const browserConfig = invocation.args.find((value) =>
    value.startsWith("mcp_servers="),
  )!;
  assert.match(browserConfig, /--isolated/);
  assert.match(browserConfig, /--image-responses.*allow/);
  assert.match(browserConfig, /browser_take_screenshot/);
  assert.equal(
    await readFile(sourceMarker, "utf8"),
    "Existing source must stay intact.",
  );
  assert.equal(
    invocation.args.some((value) => value.includes("--output-schema")),
    false,
  );
});

it("passes only an explicit trusted loopback proxy override while ignoring user configuration", async () => {
  const invocationFile = join(directory, "proxy.json");
  const fakeCodex = await executable(
    "proxy.mjs",
    `
    writeFileSync(${JSON.stringify(invocationFile)}, JSON.stringify(process.argv));
    writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], '{}');
  `,
  );
  await executeCodex(
    prepared(),
    new AbortController().signal,
    "http://127.0.0.1:43210/v1",
    { executable: fakeCodex, browserCli: "browser.js" },
  );
  const invocation = await readFile(invocationFile, "utf8");
  assert.match(invocation, /design-review-proxy/);
  assert.match(invocation, /43210/);
  assert.match(invocation, /responses/);
  await assert.rejects(
    executeCodex(
      prepared(),
      new AbortController().signal,
      "https://example.com/v1",
      { executable: fakeCodex, browserCli: "browser.js" },
    ),
    (error: unknown) =>
      error instanceof ReviewError && error.code === "invalid-request",
  );
});

it("rejects incompatible Codex versions before executing a review", async () => {
  const fakeCodex = await executable(
    "old.mjs",
    "throw new Error('Review must not start');",
    "0.1.0",
  );
  await assert.rejects(
    executeCodex(prepared(), new AbortController().signal, undefined, {
      executable: fakeCodex,
      browserCli: "browser.js",
    }),
    (error: unknown) =>
      error instanceof ReviewError && error.code === "runtime-version",
  );
});

it("accepts only the verified desktop prerelease alongside the pinned stable version", async () => {
  const accepted = await executable(
    "desktop.mjs",
    "writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], '{}');",
    "0.165.0-alpha.1.2",
  );
  assert.deepEqual(
    await executeCodex(prepared(), new AbortController().signal, undefined, {
      executable: accepted,
      browserCli: "browser.js",
    }),
    {},
  );
  const rejected = await executable(
    "unknown-alpha.mjs",
    "throw new Error('Review must not start');",
    "0.165.0-alpha.999",
  );
  await assert.rejects(
    executeCodex(prepared(), new AbortController().signal, undefined, {
      executable: rejected,
      browserCli: "browser.js",
    }),
    (error: unknown) =>
      error instanceof ReviewError && error.code === "runtime-version",
  );
});

it("rejects malformed agent output without publishing raw content", async () => {
  const fakeCodex = await executable(
    "invalid.mjs",
    "writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], 'PRIVATE invalid output');",
  );
  await assert.rejects(
    executeCodex(prepared(), new AbortController().signal, undefined, {
      executable: fakeCodex,
      browserCli: "browser.js",
    }),
    (error: unknown) =>
      error instanceof ReviewError &&
      error.code === "invalid-response" &&
      !error.message.includes("PRIVATE"),
  );
});

it("cancels Codex and its browser descendants before completing cleanup", async () => {
  const heartbeat = join(directory, "heartbeat.txt");
  const fakeCodex = await executable(
    "cancel.mjs",
    `
    spawn(process.execPath, ['-e', ${JSON.stringify(`const {writeFileSync}=require('node:fs'); setInterval(()=>writeFileSync(${JSON.stringify(heartbeat)}, String(Date.now())), 10);`)}], {stdio:'ignore'});
    process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);
  `,
  );
  const controller = new AbortController();
  const review = executeCodex(prepared(), controller.signal, undefined, {
    executable: fakeCodex,
    browserCli: "browser.js",
  });
  const rejected = assert.rejects(
    review,
    (error: unknown) =>
      error instanceof ReviewError && error.code === "cancelled",
  );
  let started = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await readFile(heartbeat);
      started = true;
      break;
    } catch {
      await delay(10);
    }
  }
  assert.ok(started, "Synthetic browser process must start before cancelling");
  controller.abort();
  await rejected;
  const stopped = await readFile(heartbeat, "utf8");
  await delay(75);
  assert.equal(await readFile(heartbeat, "utf8"), stopped);
});

it("allows MCP to close its detached browser after Codex exits on cancellation", async () => {
  const heartbeat = join(directory, "detached-heartbeat.txt");
  const browserPidFile = join(directory, "detached-browser-pid.txt");
  const browserScript = `const {writeFileSync}=require('node:fs'); setInterval(()=>writeFileSync(${JSON.stringify(heartbeat)}, String(Date.now())), 10);`;
  const mcpScript = `
    const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs');
    const browser=spawn(process.execPath,['-e',${JSON.stringify(browserScript)}],{detached:true,stdio:'ignore'});
    writeFileSync(${JSON.stringify(browserPidFile)},String(browser.pid));
    process.on('SIGTERM',()=>setTimeout(()=>{process.kill(-browser.pid,'SIGKILL');process.exit(0);},100));
    setInterval(()=>{},1000);
  `;
  const fakeCodex = await executable(
    "detached-browser.mjs",
    `
    spawn(process.execPath,['-e',${JSON.stringify(mcpScript)}],{stdio:'ignore'});
    setInterval(()=>{},1000);
  `,
  );
  const controller = new AbortController();
  const review = executeCodex(prepared(), controller.signal, undefined, {
    executable: fakeCodex,
    browserCli: "browser.js",
  });
  const rejected = assert.rejects(
    review,
    (error: unknown) =>
      error instanceof ReviewError && error.code === "cancelled",
  );
  let started = false;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await readFile(heartbeat);
        started = true;
        break;
      } catch {
        await delay(10);
      }
    }
    assert.ok(
      started,
      "Detached synthetic browser must start before cancellation",
    );
    controller.abort();
    await rejected;
    const stopped = await readFile(heartbeat, "utf8");
    await delay(75);
    assert.equal(await readFile(heartbeat, "utf8"), stopped);
  } finally {
    controller.abort();
    // Fixture cleanup also contains failures of the shutdown behavior under test.
    try {
      process.kill(-Number(await readFile(browserPidFile, "utf8")), "SIGKILL");
    } catch {
      /* Already closed. */
    }
    await rejected;
  }
});
