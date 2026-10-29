// Hides process transport and isolated browser configuration from review callers.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import type { PreparedReview } from "../run-review/reviewLifecycle.ts";
import { ReviewError } from "../run-review/reviewError.ts";
import { resolveAssetRoot } from "../run-review/assetRoot.ts";

const require = createRequire(import.meta.url);
export const runtimeRequirements = JSON.parse(
  await readFile(
    new URL("./runtimeRequirements.json", import.meta.url),
    "utf8",
  ),
) as {
  codex: string;
  compatibleCodexPrereleases: string[];
  playwrightMcp: string;
  playwright: string;
  reviewTimeoutMs: number;
  viewports: { width: number; height: number }[];
};

const browserTools = [
  "browser_navigate",
  "browser_snapshot",
  "browser_evaluate",
  "browser_take_screenshot",
  "browser_resize",
  "browser_click",
  "browser_hover",
  "browser_press_key",
  "browser_wait_for",
  "browser_tabs",
  "browser_close",
  "browser_console_messages",
];

export function browserConfiguration(
  browserCli: string,
  evidenceDirectory: string,
) {
  return {
    command: process.execPath,
    args: [
      browserCli,
      "--headless",
      "--isolated",
      "--browser",
      "chromium",
      "--image-responses",
      "allow",
      "--output-dir",
      evidenceDirectory,
    ],
    required: true,
    startup_timeout_sec: 60,
    tool_timeout_sec: 60,
    default_tools_approval_mode: "approve",
    enabled_tools: browserTools,
  };
}

// JSON strings/arrays are valid TOML values; objects need TOML inline-table syntax.
function toml(value: string | number | boolean | string[] | object): string {
  if (typeof value !== "object" || Array.isArray(value))
    return JSON.stringify(value);
  return `{${Object.entries(value)
    .map(([key, entry]) => `${key}=${toml(entry)}`)
    .join(",")}}`;
}

export async function runProcess(
  executable: string,
  args: string[],
  signal: AbortSignal,
  options: { cwd?: string; input?: string; installationOutput?: boolean } = {},
): Promise<string> {
  if (signal.aborted)
    throw new ReviewError("cancelled", "Design review was cancelled.");
  if (process.platform === "win32")
    throw new ReviewError(
      "runtime-unavailable",
      "Reviews currently require macOS or Linux.",
    );
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let termination: Promise<void> | undefined;
    const killGroup = (killSignal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, killSignal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH")
          child.kill(killSignal);
      }
    };
    const groupExists = () => {
      if (!child.pid) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
      }
    };
    const terminateGroup = () => {
      termination ??= (async () => {
        // Playwright owns a detached browser group. Let MCP close it before forcing exit.
        killGroup("SIGTERM");
        for (let attempt = 0; attempt < 30 && groupExists(); attempt++)
          await delay(50);
        killGroup("SIGKILL");
      })();
      return termination;
    };
    const abort = () => {
      void terminateGroup();
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    // Consume both streams, but never echo agent output or potentially sensitive diagnostics.
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-1000000);
      if (options.installationOutput) process.stderr.write(chunk);
    });
    if (options.installationOutput)
      child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    else child.stderr.resume();
    child.stdin.on("error", () => {});
    child.stdin.end(options.input);
    child.on("error", () =>
      reject(
        new ReviewError(
          "runtime-unavailable",
          `Could not start ${executable === "codex" ? "Codex CLI" : "the runtime process"}. Check installation.`,
        ),
      ),
    );
    child.on("exit", () => {
      void terminateGroup();
    });
    child.on("close", async (code) => {
      await terminateGroup();
      signal.removeEventListener("abort", abort);
      if (signal.aborted)
        reject(new ReviewError("cancelled", "Design review was cancelled."));
      else if (code !== 0)
        reject(
          new ReviewError(
            "agent-failed",
            `Runtime process exited unsuccessfully (${code ?? "signal"}). Check authentication and browser installation.`,
          ),
        );
      else resolve(stdout.trim());
    });
  });
}

export async function browserPaths() {
  try {
    const mcpManifest = require.resolve("@playwright/mcp/package.json");
    const browserManifest = require.resolve("playwright/package.json", {
      paths: [dirname(mcpManifest)],
    });
    const mcp = JSON.parse(await readFile(mcpManifest, "utf8")) as {
      version: string;
    };
    const browser = JSON.parse(await readFile(browserManifest, "utf8")) as {
      version: string;
    };
    if (
      mcp.version !== runtimeRequirements.playwrightMcp ||
      browser.version !== runtimeRequirements.playwright
    )
      throw new ReviewError(
        "runtime-version",
        "Browser packages do not match core's pinned runtime. Reinstall package dependencies.",
      );
    return {
      browserCli: join(dirname(mcpManifest), "cli.js"),
      installCli: join(dirname(browserManifest), "cli.js"),
    };
  } catch (error) {
    if (error instanceof ReviewError) throw error;
    throw new ReviewError(
      "runtime-unavailable",
      "Install core dependencies before running a review.",
    );
  }
}

export async function installBrowser(
  signal: AbortSignal = new AbortController().signal,
) {
  const { installCli } = await browserPaths();
  await runProcess(
    process.execPath,
    [installCli, "install", "chromium"],
    signal,
    { installationOutput: true },
  );
}

export async function executeCodex(
  prepared: PreparedReview,
  signal: AbortSignal,
  responsesProxyUrl?: string,
  dependencies: { executable?: string; browserCli?: string } = {},
): Promise<unknown> {
  const executable = dependencies.executable ?? "codex";
  const version = await runProcess(
    executable,
    ["--version"],
    AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  );
  const parsedVersion = version.match(/codex-cli ([\w.-]+)$/)?.[1];
  if (
    parsedVersion !== runtimeRequirements.codex &&
    !runtimeRequirements.compatibleCodexPrereleases.includes(
      parsedVersion ?? "",
    )
  )
    throw new ReviewError(
      "runtime-version",
      `Codex CLI ${runtimeRequirements.codex} is required; install the matching version before reviewing.`,
    );
  const browserCli =
    dependencies.browserCli ?? (await browserPaths()).browserCli;
  const workingDirectory = await mkdtemp(join(tmpdir(), "design-qa-codex-"));
  const responseFile = join(workingDirectory, "response.json");
  try {
    const authenticationArgs: string[] = [];
    if (responsesProxyUrl !== undefined) {
      let proxy: URL;
      try {
        proxy = new URL(responsesProxyUrl);
      } catch {
        throw new ReviewError(
          "invalid-request",
          "The Responses proxy must use a trusted loopback HTTP /v1 endpoint.",
        );
      }
      if (
        proxy.protocol !== "http:" ||
        proxy.hostname !== "127.0.0.1" ||
        proxy.username ||
        proxy.password ||
        proxy.search ||
        proxy.hash ||
        proxy.pathname !== "/v1"
      )
        throw new ReviewError(
          "invalid-request",
          "The Responses proxy must use a trusted loopback HTTP /v1 endpoint.",
        );
      authenticationArgs.push(
        "-c",
        'model_provider="design-review-proxy"',
        "-c",
        `model_providers.design-review-proxy=${toml({ name: "Design review Responses proxy", base_url: proxy.href, wire_api: "responses" })}`,
      );
    }
    const runtimeInstructions = await readFile(
      new URL(
        "agent-prompt/codex-runtime-instructions.md",
        await resolveAssetRoot(),
      ),
      "utf8",
    );
    await runProcess(
      executable,
      [
        "exec",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--cd",
        workingDirectory,
        "--output-last-message",
        responseFile,
        "-c",
        `mcp_servers=${toml({ browser: browserConfiguration(browserCli, prepared.context.request.evidenceDirectory) })}`,
        "-c",
        "features.multi_agent=true",
        "-c",
        'approval_policy="never"',
        ...authenticationArgs,
        "-",
      ],
      signal,
      {
        cwd: workingDirectory,
        input: `${prepared.prompt}\n\n${runtimeInstructions.trimEnd()}`,
      },
    );
    try {
      if ((await stat(responseFile)).size > 10000000)
        throw new Error("Response too large");
      return JSON.parse(await readFile(responseFile, "utf8"));
    } catch {
      throw new ReviewError(
        "invalid-response",
        "Codex did not return a supported JSON response.",
      );
    }
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
