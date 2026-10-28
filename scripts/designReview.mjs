import {
  appendFile,
  mkdir,
  lstat,
  symlink,
  mkdtemp,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { userInfo } from "node:os";
import { fileURLToPath } from "node:url";

const ACTION_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CORE_CLI_PATH = path.join(ACTION_DIRECTORY, "dist/core/cli.mjs");
export const PLAYWRIGHT_MCP_VERSION = "0.0.80";
export const PLAYWRIGHT_VERSION = "1.63.0-alpha-2026-08-31";

export async function resolveSourceDirectory(repositoryDirectory, sourceScope) {
  if (
    !sourceScope ||
    path.isAbsolute(sourceScope) ||
    sourceScope.includes("\\") ||
    /[\r\n]/u.test(sourceScope)
  ) {
    throw new Error("source-scope must be a relative repository directory");
  }
  const segments = sourceScope.split("/");
  if (
    segments.some(
      (segment) =>
        segment === ".." ||
        segment === ".git" ||
        segment.startsWith(".env") ||
        !segment,
    )
  ) {
    throw new Error("source-scope must not contain traversal or secret paths");
  }
  // Lexical checks cannot detect a harmless-looking symlink outside the checkout.
  const repositoryPath = await realpath(repositoryDirectory);
  const sourcePath = await realpath(path.resolve(repositoryPath, sourceScope));
  const relativePath = path.relative(repositoryPath, sourcePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    relativePath
      .split(path.sep)
      .some((segment) => segment === ".git" || segment.startsWith(".env"))
  ) {
    throw new Error(
      "source-scope resolves outside the checkout or to a secret path",
    );
  }
  if (!(await stat(sourcePath)).isDirectory())
    throw new Error("source-scope must name a directory");
  return sourcePath;
}

export async function linkDefaultCodexHome({ accountHome, codexHome }) {
  const defaultCodexHome = path.join(accountHome, ".codex");
  // Ubuntu's sudo-rs may discard CODEX_HOME despite sudo -E. Keep Codex's
  // account-home fallback pointed at the same trusted proxy and browser config.
  try {
    await lstat(defaultCodexHome);
    throw new Error(
      "The account's default .codex path already exists; use a fresh disposable runner",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // symlink is exclusive: a competing creation after lstat must fail, never overwrite.
  await symlink(codexHome, defaultCodexHome, "dir");
  return defaultCodexHome;
}

export function parseReviewInputs({
  appUrl,
  paths = '["/"]',
  viewports = '[{"width":1440,"height":900},{"width":390,"height":844}]',
  reviewFocus = "",
  timeoutMinutes = "10",
}) {
  const parsedUrl = new URL(appUrl);
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.hash ||
    parsedUrl.search
  )
    throw new Error(
      "app-url must be an HTTP URL without credentials, query, or fragment",
    );
  const scope = JSON.parse(paths);
  if (
    !Array.isArray(scope) ||
    !scope.length ||
    scope.length > 20 ||
    scope.some(
      (route) =>
        typeof route !== "string" ||
        !route.startsWith("/") ||
        route.startsWith("//") ||
        route.includes("\\") ||
        /[\r\n]/u.test(route) ||
        new URL(route, parsedUrl).origin !== parsedUrl.origin,
    )
  )
    throw new Error(
      "paths must be a JSON array of 1–20 same-origin root-relative routes",
    );
  const parsedViewports = JSON.parse(viewports);
  if (
    !Array.isArray(parsedViewports) ||
    !parsedViewports.length ||
    parsedViewports.length > 5 ||
    parsedViewports.some(
      (viewport) =>
        !viewport ||
        Object.keys(viewport).sort().join(",") !== "height,width" ||
        !Number.isInteger(viewport.width) ||
        !Number.isInteger(viewport.height) ||
        viewport.width < 240 ||
        viewport.height < 240 ||
        viewport.width > 3840 ||
        viewport.height > 3840,
    )
  )
    throw new Error(
      "viewports must contain 1–5 width/height objects with integer sizes from 240 to 3840",
    );
  const reviewTimeoutMinutes = Number(timeoutMinutes);
  if (
    !Number.isInteger(reviewTimeoutMinutes) ||
    reviewTimeoutMinutes < 1 ||
    reviewTimeoutMinutes > 30
  )
    throw new Error("timeout-minutes must be an integer from 1 to 30");
  if (typeof reviewFocus !== "string" || reviewFocus.length > 10000)
    throw new Error(
      "review-focus must be text no longer than 10000 characters",
    );
  return {
    appUrl: parsedUrl.href,
    scope,
    viewports: parsedViewports,
    instructions: reviewFocus,
    reviewTimeoutMs: reviewTimeoutMinutes * 60000,
  };
}

export function createBrowserConfiguration({
  browserCliPath,
  evidenceDirectory,
}) {
  return `[features]\nmulti_agent = true\n\n[mcp_servers.browser]\ncommand = "node"\nargs = ${JSON.stringify([browserCliPath, "--headless", "--isolated", "--browser", "chromium", "--image-responses", "allow", "--output-dir", evidenceDirectory])}\nrequired = true\nstartup_timeout_sec = 60\ntool_timeout_sec = 60\ndefault_tools_approval_mode = "approve"\nenabled_tools = ["browser_navigate", "browser_snapshot", "browser_evaluate", "browser_take_screenshot", "browser_resize", "browser_click", "browser_hover", "browser_press_key", "browser_wait_for", "browser_tabs", "browser_close", "browser_console_messages"]\n`;
}

export async function runCommand(executable, args, { cwd, input } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(
            new Error(
              `${path.basename(executable)} exited with code ${code}: ${stderr.slice(-2000)}`,
            ),
          ),
    );
    if (input !== undefined) child.stdin.end(input);
  });
}

async function publishOutputs(outputFile, values) {
  for (const value of Object.values(values))
    if (/[\r\n]/u.test(String(value)))
      throw new Error("Output values cannot contain newlines");
  await appendFile(
    outputFile,
    Object.entries(values)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  );
}

export async function prepareDesignReviewRun({
  repositoryDirectory,
  runnerTemporaryDirectory,
  appUrl,
  paths,
  sourceScope = ".",
  accountHome = userInfo().homedir,
  viewports,
  reviewFocus,
  timeoutMinutes,
  requestedArtifactDirectory = "",
  outputsFile,
  coreCliPath = CORE_CLI_PATH,
  run = runCommand,
}) {
  const reviewInputs = parseReviewInputs({
    appUrl,
    paths,
    viewports,
    reviewFocus,
    timeoutMinutes,
  });
  const sourceDirectory = await resolveSourceDirectory(
    repositoryDirectory,
    sourceScope,
  );
  const temporaryDirectory = await mkdtemp(
    path.join(runnerTemporaryDirectory, "design-review-agent-"),
  );
  const artifactDirectory = requestedArtifactDirectory
    ? path.resolve(repositoryDirectory, requestedArtifactDirectory)
    : path.join(temporaryDirectory, "artifact");
  // Refuse existing destinations so a failed run cannot publish an earlier success.
  try {
    await stat(artifactDirectory);
    throw new Error("Artifact directory already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!(await stat(path.dirname(artifactDirectory))).isDirectory())
    throw new Error("Artifact parent must exist");
  const evidenceDirectory = path.join(temporaryDirectory, "evidence");
  const codexHome = path.join(temporaryDirectory, "codex-home");
  await Promise.all([mkdir(evidenceDirectory), mkdir(codexHome)]);
  const promptFile = path.join(temporaryDirectory, "prompt.md");
  const schemaFile = path.join(temporaryDirectory, "schema.json");
  const responseFile = path.join(temporaryDirectory, "response.json");
  const contextFile = path.join(temporaryDirectory, "context.json");
  const requestFile = path.join(temporaryDirectory, "request.json");
  const stateFile = path.join(temporaryDirectory, "state.json");
  const browserCliPath = path.join(
    ACTION_DIRECTORY,
    "node_modules/@playwright/mcp/cli.js",
  );
  await writeFile(
    requestFile,
    JSON.stringify({ ...reviewInputs, sourceDirectory, evidenceDirectory }),
  );
  await run(process.execPath, [
    coreCliPath,
    "prepare",
    "--request",
    requestFile,
    "--context",
    contextFile,
    "--prompt",
    promptFile,
    "--schema",
    schemaFile,
  ]);
  await writeFile(
    path.join(codexHome, "config.toml"),
    createBrowserConfiguration({ browserCliPath, evidenceDirectory }),
  );
  await linkDefaultCodexHome({ accountHome, codexHome });
  const state = {
    repositoryDirectory,
    artifactDirectory,
    evidenceDirectory,
    contextFile,
    responseFile,
    temporaryDirectory,
    coreCliPath,
  };
  await writeFile(stateFile, JSON.stringify(state));
  await publishOutputs(outputsFile, {
    promptFile,
    schemaFile,
    responseFile,
    codexHome,
    stateFile,
  });
  return state;
}

export async function finalizeDesignReviewRun({
  stateFile,
  codexOutcome,
  outputsFile,
  run = runCommand,
}) {
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  const runIssues = [];
  let reviewStatus = "complete";
  if (codexOutcome !== "success") {
    reviewStatus = "failed";
    runIssues.push({
      severity: "error",
      code: "agent_execution_failed",
      message:
        "Codex did not finish successfully. The review may have timed out or encountered a runtime error; inspect the GitHub step log. No complete assessment is claimed.",
    });
  }
  let response;
  try {
    response = JSON.parse(await readFile(state.responseFile, "utf8"));
    if (Array.isArray(response.runIssues))
      runIssues.push(...response.runIssues);
    // Keep orchestration state and raw model output outside the directory callers upload.
    const finalizedOutput = await run(process.execPath, [
      state.coreCliPath,
      "finalize",
      "--context",
      state.contextFile,
      "--response",
      state.responseFile,
      "--output",
      state.artifactDirectory,
    ]);
    if (finalizedOutput) {
      const finalized = JSON.parse(finalizedOutput);
      if (!["complete", "incomplete"].includes(finalized.status))
        throw new Error("Core returned an invalid review status");
      if (reviewStatus === "complete") reviewStatus = finalized.status;
      for (const issue of finalized.runIssues ?? []) {
        if (
          !runIssues.some(
            (existing) =>
              existing.code === issue.code &&
              existing.message === issue.message,
          )
        )
          runIssues.push(issue);
      }
    }
    if (reviewStatus === "complete" && runIssues.length)
      reviewStatus = runIssues.some((issue) => issue.severity === "error")
        ? "failed"
        : "incomplete";
  } catch (error) {
    reviewStatus = "failed";
    const responseMissing =
      error.code === "ENOENT" && error.path === state.responseFile;
    runIssues.push(
      responseMissing
        ? {
            severity: codexOutcome === "success" ? "error" : "warning",
            code: "agent_response_missing",
            message:
              "Codex did not produce the required response. No report was generated.",
          }
        : {
            severity: "error",
            code: "report_generation_failed",
            message: error.message,
          },
    );
  }
  await mkdir(state.artifactDirectory, { recursive: true });
  await writeFile(
    path.join(state.artifactDirectory, "run-status.json"),
    JSON.stringify({ status: reviewStatus, runIssues }, null, 2),
    { flag: "wx" },
  );
  // Publish a diagnostic artifact even when execution failed, so failure survives upload.
  await publishOutputs(outputsFile, {
    "design-qa-artifact-directory-path": state.artifactDirectory,
    "review-status": reviewStatus,
  });
  return { status: reviewStatus, runIssues };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "prepare") {
    const [
      repositoryDirectory,
      runnerTemporaryDirectory,
      appUrl,
      paths,
      sourceScope,
      viewports,
      reviewFocus,
      timeoutMinutes,
      requestedArtifactDirectory,
      outputsFile,
    ] = args;
    await prepareDesignReviewRun({
      repositoryDirectory,
      runnerTemporaryDirectory,
      appUrl,
      paths,
      sourceScope,
      viewports,
      reviewFocus,
      timeoutMinutes,
      requestedArtifactDirectory,
      outputsFile,
    });
  } else if (command === "finalize") {
    const [stateFile, codexOutcome, outputsFile] = args;
    const result = await finalizeDesignReviewRun({
      stateFile,
      codexOutcome,
      outputsFile,
    });
    if (result.status === "failed") process.exitCode = 1;
  } else throw new Error("Expected prepare or finalize command");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
