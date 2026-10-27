import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  prepareDesignReviewRun,
  renderDesignQaHtmlArtifact,
  resolveDesignQaSourceFilePath,
  validateDesignQaSourceAccessTestResponse,
} from "./designReview.mjs";

async function createDesignReviewTestFixture(context) {
  const testTemporaryDirectoryPath = await mkdtemp(
    path.join(os.tmpdir(), "review-test-"),
  );
  context.after(() =>
    rm(testTemporaryDirectoryPath, { recursive: true, force: true }),
  );
  const customerRepositoryDirectoryPath = path.join(
    testTemporaryDirectoryPath,
    "checkout",
  );
  await mkdir(customerRepositoryDirectoryPath);
  await mkdir(path.join(customerRepositoryDirectoryPath, "src"));
  const designQaSourceFilePathToCheck = "src/App.tsx";
  const designQaSourceFileContents =
    'export const title = "<Hello & goodbye>";\n';
  await writeFile(
    path.join(customerRepositoryDirectoryPath, designQaSourceFilePathToCheck),
    designQaSourceFileContents,
  );
  return {
    customerRepositoryDirectoryPath,
    designQaSourceFilePathToCheck,
    designQaSourceFileContents,
    runnerTemporaryDirectoryPath: testTemporaryDirectoryPath,
  };
}

test("renders a design review page with escaped source and only HTML in the artifact", async (context) => {
  const designReviewRunInputs = await createDesignReviewTestFixture(context);
  const preparedDesignReviewRunPaths = await prepareDesignReviewRun(
    designReviewRunInputs,
  );
  // Supplying source in the prompt would let the model pass without reading the checkout.
  assert.equal(
    (
      await readFile(
        preparedDesignReviewRunPaths.codexInputPromptFilePath,
        "utf8",
      )
    ).includes(designReviewRunInputs.designQaSourceFileContents),
    false,
  );
  await writeFile(
    preparedDesignReviewRunPaths.codexOutputResponseFilePath,
    JSON.stringify({
      designQaSourceFilePathToCheck:
        designReviewRunInputs.designQaSourceFilePathToCheck,
      designQaSourceFileContentsExcerpt:
        designReviewRunInputs.designQaSourceFileContents.trim(),
    }),
  );
  assert.equal(
    await renderDesignQaHtmlArtifact(
      preparedDesignReviewRunPaths.designReviewRunStateFilePath,
    ),
    preparedDesignReviewRunPaths.designQaArtifactDirectoryPath,
  );
  const designQaHtmlArtifactContents = await readFile(
    path.join(
      preparedDesignReviewRunPaths.designQaArtifactDirectoryPath,
      "index.html",
    ),
    "utf8",
  );
  assert.match(designQaHtmlArtifactContents, /&lt;Hello &amp; goodbye&gt;/u);
  assert.match(designQaHtmlArtifactContents, /<title>Design review<\/title>/u);
  assert.equal(
    path.dirname(preparedDesignReviewRunPaths.codexOutputResponseFilePath) ===
      preparedDesignReviewRunPaths.designQaArtifactDirectoryPath,
    false,
  );
});

test("rejects traversal, absolute paths, environment files, and escaped symlinks", async (context) => {
  const designReviewRunInputs = await createDesignReviewTestFixture(context);
  for (const designQaSourceFilePathToCheck of [
    "../secret",
    "/tmp/secret",
    ".env",
    "src/.env.live",
    "src/../App.tsx",
    "src\\App.tsx",
  ]) {
    await assert.rejects(
      resolveDesignQaSourceFilePath(
        designReviewRunInputs.customerRepositoryDirectoryPath,
        designQaSourceFilePathToCheck,
      ),
    );
  }
  const outsideRepositorySourceFilePath = path.join(
    designReviewRunInputs.runnerTemporaryDirectoryPath,
    "outside.ts",
  );
  await writeFile(outsideRepositorySourceFilePath, "outside");
  await symlink(
    outsideRepositorySourceFilePath,
    path.join(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      "src",
      "escape.ts",
    ),
  );
  await assert.rejects(
    resolveDesignQaSourceFilePath(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      "src/escape.ts",
    ),
    /escapes/u,
  );
  await writeFile(
    path.join(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      ".env.test",
    ),
    "placeholder",
  );
  await symlink(
    path.join(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      ".env.test",
    ),
    path.join(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      "src",
      "alias.ts",
    ),
  );
  await assert.rejects(
    resolveDesignQaSourceFilePath(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      "src/alias.ts",
    ),
    /secret/u,
  );
});

test("rejects empty, oversized, and directory source inputs", async (context) => {
  const designReviewRunInputs = await createDesignReviewTestFixture(context);
  await writeFile(
    path.join(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      "empty.ts",
    ),
    "",
  );
  await writeFile(
    path.join(
      designReviewRunInputs.customerRepositoryDirectoryPath,
      "large.ts",
    ),
    "x".repeat(262145),
  );
  for (const designQaSourceFilePathToCheck of ["empty.ts", "large.ts", "src"]) {
    await assert.rejects(
      resolveDesignQaSourceFilePath(
        designReviewRunInputs.customerRepositoryDirectoryPath,
        designQaSourceFilePathToCheck,
      ),
      /nonempty file/u,
    );
  }
});

test("validates source-access test path, excerpt, and response shape", () => {
  for (const codexOutputResponse of [
    null,
    [],
    {},
    {
      designQaSourceFilePathToCheck: "other.ts",
      designQaSourceFileContentsExcerpt: "real",
    },
    {
      designQaSourceFilePathToCheck: "source.ts",
      designQaSourceFileContentsExcerpt: " ",
    },
    {
      designQaSourceFilePathToCheck: "source.ts",
      designQaSourceFileContentsExcerpt: "invented",
    },
    {
      designQaSourceFilePathToCheck: "source.ts",
      designQaSourceFileContentsExcerpt: "real",
      extra: true,
    },
  ]) {
    assert.throws(
      () =>
        validateDesignQaSourceAccessTestResponse(
          codexOutputResponse,
          "source.ts",
          "real source",
        ),
      /valid exact/u,
    );
  }
  assert.deepEqual(
    validateDesignQaSourceAccessTestResponse(
      {
        designQaSourceFilePathToCheck: "source.ts",
        designQaSourceFileContentsExcerpt: "real",
      },
      "source.ts",
      "real source",
    ),
    {
      designQaSourceFilePathToCheck: "source.ts",
      designQaSourceFileContentsExcerpt: "real",
    },
  );
});

test("missing and malformed responses never produce success HTML", async (context) => {
  const designReviewRunInputs = await createDesignReviewTestFixture(context);
  for (const simulatedCodexOutputResponseContents of [
    undefined,
    "invalid json",
    JSON.stringify({
      designQaSourceFilePathToCheck:
        designReviewRunInputs.designQaSourceFilePathToCheck,
      designQaSourceFileContentsExcerpt: "fabricated",
    }),
  ]) {
    const preparedDesignReviewRunPaths = await prepareDesignReviewRun(
      designReviewRunInputs,
    );
    if (simulatedCodexOutputResponseContents !== undefined)
      await writeFile(
        preparedDesignReviewRunPaths.codexOutputResponseFilePath,
        simulatedCodexOutputResponseContents,
      );
    await assert.rejects(
      renderDesignQaHtmlArtifact(
        preparedDesignReviewRunPaths.designReviewRunStateFilePath,
      ),
    );
    await assert.rejects(
      access(
        path.join(
          preparedDesignReviewRunPaths.designQaArtifactDirectoryPath,
          "index.html",
        ),
      ),
    );
  }
});

test("refuses existing destinations and duplicate success writes", async (context) => {
  const designReviewRunInputs = await createDesignReviewTestFixture(context);
  const requestedDesignQaArtifactDirectoryPath = path.join(
    designReviewRunInputs.runnerTemporaryDirectoryPath,
    "custom-artifact",
  );
  const preparedDesignReviewRunPaths = await prepareDesignReviewRun({
    ...designReviewRunInputs,
    requestedDesignQaArtifactDirectoryPath,
  });
  await assert.rejects(
    prepareDesignReviewRun({
      ...designReviewRunInputs,
      requestedDesignQaArtifactDirectoryPath,
    }),
    /exist/u,
  );
  await writeFile(
    preparedDesignReviewRunPaths.codexOutputResponseFilePath,
    JSON.stringify({
      designQaSourceFilePathToCheck:
        designReviewRunInputs.designQaSourceFilePathToCheck,
      designQaSourceFileContentsExcerpt:
        designReviewRunInputs.designQaSourceFileContents,
    }),
  );
  await renderDesignQaHtmlArtifact(
    preparedDesignReviewRunPaths.designReviewRunStateFilePath,
  );
  await assert.rejects(
    renderDesignQaHtmlArtifact(
      preparedDesignReviewRunPaths.designReviewRunStateFilePath,
    ),
    /exist/u,
  );
});
