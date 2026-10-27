# Design review agent

GitHub Action for running a design review agent against an existing checkout.

NOTE: Currently this action simply verifies an exact excerpt from a named source file and creates a basic HTML page; design assessment, browser access, findings reports, and a hosted service are not implemented yet.

## Usage

Use a disposable GitHub-hosted Ubuntu runner. Check out your repository first. Supply `openai-api-key` from a repository secret and `design-qa-source-file-path-to-check` as a repository-relative source path. The optional `design-qa-artifact-directory-path` must not already exist and its parent must exist; otherwise output defaults to a unique runner temporary directory.

```yaml
name: Run design review
on: workflow_dispatch
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-26.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: sampl/design-review-agent@main
        id: review
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          design-qa-source-file-path-to-check: src/App.tsx
      - uses: actions/upload-artifact@v7
        with:
          name: design-review
          path: ${{ steps.review.outputs.design-qa-artifact-directory-path }}
          if-no-files-found: error
```

Download and extract the artifact, then open `index.html`. GitHub does not host artifact HTML as a website. Only the validated HTML is packaged; intermediate model JSON stays outside the artifact directory. Missing output, invalid JSON, a mismatched path or excerpt, or an existing destination fails the Action without a successful artifact output.

## Setup instructions for coding agents

When asked to set up this Action in another repository:

1. Read this README and `action.yml` from the published Action repository. If either is unavailable or the Action has not been published, stop and explain the blocker. Use the actual documented interface; do not invent inputs or a release reference.
2. Inspect the caller's documentation and existing GitHub workflows. Choose an existing, nonempty source file relative to its checkout for `design-qa-source-file-path-to-check`; avoid secrets and environment files. This version verifies source access and creates HTML, so no app build, server, browser, or screenshot setup is needed.
3. Add a workflow under `.github/workflows/`, using the example above as the starting point. Enable only `workflow_dispatch`, with no push, pull request, or scheduled triggers. Keep `contents: read`, a bounded timeout, and checkout credentials disabled. Pin the Action to a reviewed, published commit SHA.
4. Pass the OpenAI API key through `${{ secrets.OPENAI_API_KEY }}`. Never read secret or environment values or put credentials in files. Tell the user to open their repository's **Settings → Secrets and variables → Actions → New repository secret**, name it `OPENAI_API_KEY`, and paste their key themselves. Do not run the workflow until that setup is complete.
5. Upload `${{ steps.review.outputs.design-qa-artifact-directory-path }}` using the artifact upload step shown above. Omit `design-qa-artifact-directory-path` unless a custom destination is needed; a custom directory must be new and its parent must already exist.
6. Validate the workflow against the current Action inputs and the caller's existing conventions. Summarize changes, the chosen source file and pinned revision, and any remaining user setup. Ask about genuinely missing requirements instead of guessing.
7. Explain how to run it: make the workflow available on the repository's default branch, open **Actions → Run design review → Run workflow**, select the trusted branch to review, and start the run. Then open the completed run, download the `design-review` artifact, extract it, and open `index.html`.

Keep this setup limited to manual runs on trusted code. The current artifact proves source access; it is not a design assessment or screenshot report.

## Execution

- Runs entirely in the caller's GitHub Actions job, reusing its checkout. The caller owns any dependency installation, build, and server startup; this Action does not clone the application or use a backend.
- Uses the pinned official OpenAI Codex Action to install Codex CLI, configure its Responses API proxy, and run non-interactively with the default model. CLI and proxy currently follow upstream's installation default.
- Codex reads the caller's checkout under a read-only permission profile and follows repository instructions. The prompt includes the file path, never its contents. Source included in model requests goes to OpenAI; no data goes to our own server.
- The official Action drops sudo privileges for the rest of the job. Complete dependency installation and privileged setup first; subsequent rendering and artifact upload need no sudo.
- Run manually with trusted code and a user with repository write access. Do not expose the key to untrusted pull requests or use privileged checkout-and-execute workflows.
- Rejects source traversal, symlinks escaping the checkout, environment files, empty files, and files larger than 256 KiB. This named-file check bounds the verification task; it does not isolate Codex from all other readable checkout files.
- Treats model output as untrusted: schema-constrained JSON must contain the requested path and an exact nonempty source excerpt before deterministic code creates escaped HTML. The caller uploads the returned artifact directory; existing report schemas and viewers are not integrated.

## Development

- Requirements: Node 24
- Testing: `pnpm run test`
- Lint: `node --check scripts/designReview.mjs`
- Typechecking: TBD
- Formatting: TBD
- Spellcheck: TBD

## TODO

- Split the helper into separate modules or entrypoints soon. Preserve public inputs/outputs, response schema, preparation outputs, saved state fields, and temporary file paths; otherwise update all producers, consumers, Action commands/arguments, and tests together to avoid breaking the handoff between steps.
- During that split, keep path/symlink/secret-file checks, source revalidation, exact excerpt matching, HTML escaping, and stale-output prevention shared rather than duplicated. Resolve imports from the Action repository rather than the customer working directory, and prevent imported modules from automatically running CLI commands.
- Verify the split with unit tests and a CLI smoke test: preparation → fixture response → rendering. Check the returned paths, output names, and HTML without making an API call.
- Move the fixed instructions into a separate prompt template; have the helper fill in runtime values and write the final prompt.
- Add browser access, screenshot inspection, design assessment, and report packaging.
- Instructions for pinning a specific version/commit of this repo?
- Instructions to trigger for PRs, pushes etc
- Reuse the caller's running application in the same job.
