import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { browserConfiguration, browserPaths } from "./codexRuntime.ts";

// This probe verifies actual MCP image transport without making a model/API request.
const evidenceDirectory = await mkdtemp(
  path.join(os.tmpdir(), "design-review-browser-probe-"),
);
const { browserCli } = await browserPaths();
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(
    '<!doctype html><title>Design review probe</title><body style="background:#2f725a;color:white"><h1>Image transport works</h1><button>Open details</button></body>',
  );
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
assert.ok(address && typeof address !== "string");
const configuration = browserConfiguration(browserCli, evidenceDirectory);
const child = spawn(configuration.command, configuration.args, {
  stdio: ["pipe", "pipe", "pipe"],
});
type McpResult = {
  isError?: boolean;
  content: {
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }[];
};
type PendingRequest = {
  resolve: (result: McpResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
let nextRequestId = 0;
const pending = new Map<number, PendingRequest>();
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  const message = JSON.parse(line) as {
    id: number;
    result: McpResult;
    error?: unknown;
  };
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function request(method: string, params: object): Promise<McpResult> {
  const id = ++nextRequestId;
  return new Promise<McpResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP ${method} timed out: ${stderr.slice(-2000)}`));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
  });
}
try {
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "design-review-probe", version: "1" },
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );
  const navigation = await request("tools/call", {
    name: "browser_navigate",
    arguments: { url: `http://127.0.0.1:${address.port}` },
  });
  assert.ok(!navigation.isError, JSON.stringify(navigation));
  const measurement = await request("tools/call", {
    name: "browser_evaluate",
    arguments: {
      function:
        "() => ({ width: window.innerWidth, height: window.innerHeight, x: window.scrollX, y: window.scrollY })",
    },
  });
  assert.ok(!measurement.isError, JSON.stringify(measurement));
  assert.ok(
    measurement.content.some(
      (block) => block.type === "text" && block.text?.includes('"width"'),
    ),
  );
  // Supplying a filename suppresses the image response in this pinned MCP release.
  const screenshot = await request("tools/call", {
    name: "browser_take_screenshot",
    arguments: {},
  });
  const image = screenshot.content.find((block) => block.type === "image");
  assert.ok(
    image,
    "Screenshot must include an inline image block, not only a text/path response",
  );
  assert.equal(image.mimeType, "image/png");
  assert.ok(image.data);
  const imageBytes = Buffer.from(image.data, "base64");
  assert.equal(imageBytes.subarray(1, 4).toString(), "PNG");
  assert.ok(imageBytes.length > 1000);
  const screenshotFiles = (await readdir(evidenceDirectory)).filter(
    (filename) => filename.endsWith(".png"),
  );
  assert.equal(screenshotFiles.length, 1);
  const screenshotFile = screenshotFiles[0];
  assert.ok(screenshotFile);
  assert.deepEqual(
    await readFile(path.join(evidenceDirectory, screenshotFile)),
    imageBytes,
  );
  console.log(
    JSON.stringify({
      status: "passed",
      inlineImageBytes: imageBytes.length,
      screenshotFile: path.join(evidenceDirectory, screenshotFile),
    }),
  );
} finally {
  child.kill("SIGTERM");
  lines.close();
  for (const request of pending.values()) clearTimeout(request.timer);
  server.close();
}
