---
name: design-review
description: Run a local design and UX review through the same core and Codex CLI flow as the GitHub Action, then present the saved report.
---

# Design review

Use this skill to test the complete design-review flow locally. The host agent gathers inputs and presents results; core launches Codex CLI to inspect the app and source, collect screenshots, validate findings, and package the report. Read the [CLI README](../cli/README.md) for available flags and prerequisites.

## Prepare the review

- Gather the running app URL, absolute source directory, routes, optional focus and viewport sizes, and a new absolute report-directory path. Reuse supplied answers; when focus is delegated, begin with the first-time experience. Resolve material business questions before starting the non-interactive run.
- Follow repository instructions. The caller owns app installation, build/start, and readiness. Confirm the app is reachable; do not assume a successful build means the server is ready.
- Use Node 24, the locally installed compatible Codex CLI, and the user's existing Codex authentication. Keep the existing Codex configuration intact. Core uses a fresh, isolated browser session matching the Action; existing browser login state is not reused.
- If prerequisites are missing, follow the CLI README's setup steps. The human handles login and secrets. Do not inspect environment values/files, authentication files, or credentials, and do not put secrets in flags or review instructions.
- Browser installation needs network access and permission to write the operating-system browser cache outside the repository. When agent sandbox restrictions block those prerequisites, request the necessary tool access instead of leaving cache-lock retries running.

## Run the identical core flow

- Resolve this skill's repository root and use absolute source/output paths. From that root, invoke `pnpm --filter design-review-agent-cli review --app-url <app-url> --source <absolute-source-directory> --output <new-absolute-report-directory>`. Add repeated `--route` and `--viewport` flags when supplied, plus `--focus` for the user's instructions. Use normal shell argument quoting; do not interpolate unescaped user text into shell commands.
- The CLI calls core's complete review flow and internal Codex runtime. Do not perform a separate host-agent review, author report JSON yourself, or invoke standalone packaging as a substitute for this run. Product source remains read-only; temporary proposals and implementation changes are outside this review flow.
- Wait for the command to finish and inspect its returned status and run issues. A complete or incomplete review exits successfully; incomplete coverage remains visible. A failed run exits nonzero and may leave `run-status.json` in the reserved output directory. Never describe failure as a successful empty review.
- If execution is cancelled, allow the CLI to stop Codex and browser processes. Do not restart an expensive review automatically; resolve the cause and obtain direction before another model run when it changes scope or adds cost beyond the requested review.

## Local report and handoff

- Present the returned report directory and a link to its `index.html`, along with core's status and run issues. Keep the whole folder together, including JSON, capture receipt, and relative screenshot assets. Downloaded/extracted reports open directly without an HTTP server.
- Open the generated report using available browser/file tools when supported. Check that the viewer loads and evidence images display. This is report-delivery verification, not another review of the application. If direct-file opening is unavailable, state that limitation rather than claiming visual verification.
- Summarize the report's prioritized findings, area coverage, limitations, and outstanding questions. Preserve uncertainty and any failure diagnostic. Lasting implementation is a separate user-authorized task.
