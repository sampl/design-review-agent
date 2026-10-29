// Translates GitHub inputs and outputs; the bundled core owns review execution.
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACTION_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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

export async function runtimeRequirements(actionDirectory = ACTION_DIRECTORY) {
  const requirements = JSON.parse(
    await readFile(
      path.join(actionDirectory, "dist/core/runtimeRequirements.json"),
      "utf8",
    ),
  );
  const packageData = JSON.parse(
    await readFile(path.join(actionDirectory, "package.json"), "utf8"),
  );
  if (
    packageData.dependencies["@playwright/mcp"] !==
      requirements.playwrightMcp ||
    packageData.dependencies.playwright !== requirements.playwright
  )
    throw new Error(
      "Action browser dependencies must match the bundled core runtime requirements",
    );
  return requirements;
}

export async function runDesignReviewAction({
  repositoryDirectory,
  runnerTemporaryDirectory,
  appUrl,
  paths,
  sourceScope = ".",
  viewports,
  reviewFocus,
  timeoutMinutes,
  requestedArtifactDirectory = "",
  outputsFile,
  proxyInformationFile,
  signal,
  review,
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
  // A fresh destination prevents a failed review from publishing an older successful report.
  try {
    await stat(artifactDirectory);
    throw new Error("Artifact directory already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!(await stat(path.dirname(artifactDirectory))).isDirectory())
    throw new Error("Artifact parent must exist");
  const evidenceDirectory = path.join(temporaryDirectory, "evidence");
  const serverInformation = JSON.parse(
    await readFile(proxyInformationFile, "utf8"),
  );
  if (
    !Number.isInteger(serverInformation.port) ||
    serverInformation.port < 1 ||
    serverInformation.port > 65535
  )
    throw new Error("Invalid Responses API proxy port");
  const responsesProxyUrl = `http://127.0.0.1:${serverInformation.port}/v1`;
  const executeReview =
    review ?? (await import("../dist/core/index.mjs")).runReview;
  let status;
  let runIssues;
  let failure;
  try {
    const result = await executeReview(
      { ...reviewInputs, sourceDirectory, evidenceDirectory },
      artifactDirectory,
      { responsesProxyUrl, signal },
    );
    status = result.status;
    runIssues = result.runIssues;
  } catch (error) {
    failure = error;
    status = "failed";
    runIssues =
      Array.isArray(error.runIssues) && error.runIssues.length
        ? error.runIssues
        : [
            {
              severity: "error",
              code: "review-execution-failed",
              message:
                "Design review could not finish; inspect the runner log.",
            },
          ];
  }
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    path.join(artifactDirectory, "run-status.json"),
    JSON.stringify({ status, runIssues }, null, 2),
    { flag: "wx" },
  );
  await publishOutputs(outputsFile, {
    "design-qa-artifact-directory-path": artifactDirectory,
    "review-status": status,
  });
  if (failure) throw failure;
  return { status, runIssues, outputDirectory: artifactDirectory };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "runtime") {
    const requirements = await runtimeRequirements();
    const codexHome = await mkdtemp(path.join(args[1], "design-review-codex-"));
    await publishOutputs(args[0], {
      "codex-version": requirements.codex,
      "codex-home": codexHome,
    });
  } else if (command === "run") {
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
      proxyInformationFile,
    ] = args;
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    try {
      await runDesignReviewAction({
        signal: controller.signal,
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
        proxyInformationFile,
      });
    } finally {
      process.removeListener("SIGINT", abort);
      process.removeListener("SIGTERM", abort);
    }
  } else throw new Error("Expected runtime or run command");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = error.code === "cancelled" ? 130 : 1;
  });
