import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

// This probe verifies actual MCP image transport without making a model/API request.
const actionDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceDirectory = await mkdtemp(
  path.join(os.tmpdir(), "design-review-browser-probe-"),
);
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(
    '<!doctype html><title>Design review probe</title><body style="background:#2f725a;color:white"><h1>Image transport works</h1><button>Open details</button></body>',
  );
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const child = spawn(
  process.execPath,
  [
    path.join(actionDirectory, "node_modules/@playwright/mcp/cli.js"),
    "--headless",
    "--isolated",
    "--browser",
    "chromium",
    "--image-responses",
    "allow",
    "--output-dir",
    evidenceDirectory,
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);
let nextRequestId = 0;
const pending = new Map();
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function request(method, params) {
  const id = ++nextRequestId;
  return new Promise((resolve, reject) => {
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
    arguments: { url: `http://127.0.0.1:${server.address().port}` },
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
      (block) => block.type === "text" && block.text.includes('"width"'),
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
  const imageBytes = Buffer.from(image.data, "base64");
  assert.equal(imageBytes.subarray(1, 4).toString(), "PNG");
  assert.ok(imageBytes.length > 1000);
  const screenshotFiles = (await readdir(evidenceDirectory)).filter(
    (filename) => filename.endsWith(".png"),
  );
  assert.equal(screenshotFiles.length, 1);
  assert.deepEqual(
    await readFile(path.join(evidenceDirectory, screenshotFiles[0])),
    imageBytes,
  );
  console.log(
    JSON.stringify({
      status: "passed",
      inlineImageBytes: imageBytes.length,
      screenshotFile: path.join(evidenceDirectory, screenshotFiles[0]),
    }),
  );
} finally {
  child.kill("SIGTERM");
  lines.close();
  for (const request of pending.values()) clearTimeout(request.timer);
  server.close();
}
