# Design QA tool core

Core does the design review. Give it a running app, the app's source code, and a place to save the results. It runs Codex CLI, checks the evidence, and produces a report you can open in a browser.

The local CLI and GitHub Action use this same review flow. The local testing skill calls the CLI, so it exercises the same flow.

## Architecture

- Core prepares review inputs and shared guidance, runs Codex with a browser, checks the report and screenshot coverage, and saves the result with its viewer.
- The app that calls core handles sign-in, environment setup, and installing, building, and starting the app under review. It waits until the app is ready and delivers the finished report. GitHub input/output mapping, API-key authentication, and disposable-runner privilege changes belong to the Action; core never changes host accounts or sudo access.
- Before starting, provide a reachable app, readable source and documentation, real browser screenshots, and writable locations for evidence and reports.
- Core runs read-only and returns findings plus execution issues and coverage limitations. It does not ask follow-up questions during a run.
- The marketing website points users to the Action. It does not run reviews or depend on core.
- This repository owns core and its local CLI, skill, and GitHub Action. Directed retains the cloud service and marketing website. The Action commits a generated core build inside its own module.
- The public entry point and automation commands stay at the package root. Internal folder names can change without changing the public report import or the locations of files distributed with the Action.

## Important files

- `cli.ts` — Automation commands for running reviews, installing the browser, preparing inputs, checking responses, and packaging reports.

## API

Call `runReview` for a complete review. Core chooses how to run the agent and configures the browser.

- `runReview(request: ReviewRequest, outputDirectory: string, options?: ReviewOptions): Promise<ReviewResult>` prepares the review, runs Codex, validates its response, and saves the report.
- `ReviewRequest` requires an HTTP(S) `appUrl`, absolute `sourceDirectory` and `evidenceDirectory`, root-relative `scope` routes, and `viewports` with width and height. Optional fields are `instructions`, `documentationPaths`, `githubRepository`, and `reviewTimeoutMs`.
- `reviewDefaults` supplies the initial routes, desktop/mobile sizes, and ten-minute agent budget. Callers use these shared defaults rather than maintaining their own copies.
- `ReviewOptions` accepts a cancellation `signal`, an optional `viewerDirectory`, and a trusted CI `responsesProxyUrl` for authentication through the runner's proxy.
- `ReviewResult` contains the packaged `report`, `runIssues`, absolute `outputDirectory`, and a `status` of `complete` or `incomplete`.
- Failures reject with `ReviewError`, which exposes `code`, `message`, and `runIssues`. Its codes distinguish invalid requests, unavailable or incompatible runtimes, agent failures, invalid responses, cancellation, timeout, and finalization failure. The caller saves and delivers any failure diagnostic; core does not create one.

The root package exports only `runReview`, `reviewDefaults`, `ReviewError`, and the types `ReviewRequest`, `ReviewOptions`, `ReviewResult`, `RunIssue`, and `ReviewErrorCode`.

- `design-review-agent-core/report` remains the public import for pure report validation for browser and Node consumers: `validateReport`, `reportSchema`, and the report/validation types documented in [report/README.md](report/README.md).
- Preparing inputs, checking and packaging results, finding viewer assets, and replacing agent execution for tests remain internal. Automation commands support specialized workflows without adding methods to the public root API.

## Development

- Use Node 24 and the workspace's pnpm tooling. Install the supported Codex CLI separately and authenticate it before local reviews; runtime requirements belong to the runtime module.
- `pnpm --filter design-review-agent-core exec node cli.ts install-browser` installs the pinned Chromium runtime after core's dependencies are installed.
- `pnpm --filter design-review-agent-core probe:browser` checks real browser measurements and screenshot image transport without a model or API key. Install Chromium first; this development probe stays out of the Action bundle.
- `pnpm --filter design-review-agent-core build:viewer` builds the viewer and separate synthetic preview scenarios. `preview` builds and serves those scenarios for development.
- Run `pnpm build:action` from the repository root to generate `github-action/dist/core/` from this source. The Action owns its distribution build.

## Testing

- Run `pnpm ts`, `pnpm lint`, `pnpm spellcheck`, `pnpm format:check`, and `pnpm test` from the repository root. Unit tests run once with Vitest, using synthetic data and subprocess stand-ins without calling a model.
- Module READMEs describe what their tests cover. When moving source files or packaged assets, build the viewer and Action bundle and check that both can find their guidance and viewer files.

## Submodules

- [Agent prompt](agent-prompt/README.md) — Shared review procedure, inspection boundaries, and evidence standards.
- [Run review](run-review/README.md) — Review preparation, execution, validation, completion, and asset lookup.
- [Codex runtime](codex-runtime/README.md) — Starting Codex, setting up a separate browser, collecting its response, and stopping its processes.
- [Report format](report/README.md) — Report data, validation without file access, development fixtures, and complete report-folder generation.
- [HTML viewer](html-viewer/README.md) — Reading findings, viewing screenshots, and handing off recommendations.
- [Build scripts](build-scripts/README.md) — Building reusable viewer assets shared by local previews and Action packaging.

## TODO

### Personal prototype

- Connect future cloud entry points to the same review flow. CLI distribution, hosted execution/storage, and a standalone skill installation remain separate work.

### Maybe

- Consider combining the local human-facing review CLI with core’s JSON-file bridge for the GitHub Action and automation. Preserve existing Action commands and the local CLI’s ownership of temporary evidence, fresh output directories, and failure diagnostics.
- Support another engine when a concrete use case justifies it. Replace or extend the internal Codex integration while retaining the review and evidence contracts; verify source access, actual browser image access, cancellation, and result validation for that engine.
