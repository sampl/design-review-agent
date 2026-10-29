# Developing the design review agent

This guide is for contributors to this Github Action. To set it up in another repository, follow [README.md](README.md).

## Architecture

### How it works

- Your workflow checks out the app, installs its dependencies, builds it, and starts its server.
- This Action sets up Codex CLI, the browser, authentication, and runner isolation, then asks core to run the review.
- Core inspects the app and source, checks the evidence, and creates the report folder. The Action returns that folder's path and the review status.
- Your workflow uploads the folder as an artifact. Download and extract it, then open `index.html` directly in a browser. Keep the whole folder together, including screenshots and JSON.

Everything runs in your GitHub job. The browser can reach localhost because it runs alongside the app. There is no separate hosted service, repository clone, billing system, or hosted report viewer.

### Runtime and access

- The Action calls the bundled core's normal `runReview` entry point. Core owns Codex launch, browser configuration, cancellation, response validation, screenshot coverage, and report packaging. This package connects that flow to GitHub inputs, runner setup, outputs, and diagnostics.
- The pinned official OpenAI Codex Action handles setup only. With no prompt supplied, it checks repository write access, installs the required Codex CLI/proxy release, starts the API-key proxy, and prepares its nonsecret connection details. It does not run the review. Core receives a loopback proxy URL without the API key.
- Before core starts, the pinned upstream Linux isolation setup removes sudo access, restricts privileged service sockets, clears supplementary groups and capability sets, and enables `no_new_privs`. These account and host changes are irreversible for the job. Use a fresh disposable Linux runner; do not run another privileged task or another review in that job afterward.
- Finish app setup and browser installation before privileges are dropped. A temporary Codex home holds setup configuration without replacing existing account configuration. Core ignores the user Codex configuration file and explicitly selects its browser and the prepared proxy.
- Codex and browser versions come from the bundled core requirements. The Action lockfile must match the browser-package versions; a unit test checks this. Playwright MCP and matching Chromium are installed before isolation starts. The browser uses a fresh profile, and missing required browser tooling fails clearly.
- The review follows repository instructions and can delegate source inspection. It does not edit source, submit forms, make purchases, or change app data. Environment values/files and credential stores are excluded from inspection.
- Browser evaluation is limited to read-only measurements, such as geometry and scroll offsets. It must not fetch, navigate through code, submit forms, or change the page or app.
- Screenshots must reach the model as actual image pixels. With the pinned MCP version, screenshot calls omit `filename` so the tool returns inline image content and saves an automatically named evidence file. Providing `filename` suppresses those inline images. Text or accessibility snapshots alone are not sufficient visual evidence.
- Core is generated from the Directed monorepo and committed in `dist/core/`, including its instructions, schema, validator, and viewer. The Action does not fetch core source during a run.

### Data and permissions

- Selected source and screenshots are sent to OpenAI in model requests. Repository and report data are not sent to our own server.
- Raw model output and working orchestration files stay outside uploaded artifacts. Valid reports contain structured JSON and relative screenshot files; execution diagnostics are separate in `run-status.json`. A timeout must not become a successful empty report.
- Run manually on trusted code with repository write access. Keep the key away from untrusted pull requests. The source scope guides inspection; it does not isolate filesystem access. Browser instructions and tool configuration are not complete isolation guarantees.

### Files

- [README.md](README.md) — Setup and configuration for people and agents using this Action in their own repositories.
- [DEVELOPERS.md](DEVELOPERS.md) — Contributor setup, architecture, validation, publishing, and roadmap.
- [action.yml](action.yml) — Composite Action inputs, environment/authentication setup, isolated core invocation, and outputs.
- [scripts/designReview.mjs](scripts/designReview.mjs) — GitHub input/output translation, source scope resolution, runtime version checks, and diagnostic artifacts around the normal core entry point.
- [scripts/isolate.ts](scripts/isolate.ts) — Linux launcher using the pinned upstream privilege boundary before calling core.
- [scripts/vendor/openai-codex-action/](scripts/vendor/openai-codex-action/) — Upstream account/socket isolation and credential helpers with their Apache license; provenance and the only adaptations are documented below.
- [scripts/designReview.test.mjs](scripts/designReview.test.mjs) — Input/path validation, normal core invocation, unchanged core outcomes, diagnostic artifacts, runtime compatibility, and pinned upstream isolation regression checks.
- [scripts/browserProbe.mjs](scripts/browserProbe.mjs) — Local browser probe for read-only measurements, inline PNG responses, and identical saved screenshots without a model or API key.
- [package.json](package.json) and [package-lock.json](package-lock.json) — Runtime requirements, commands, and pinned dependencies.
- [cspell.config.yaml](cspell.config.yaml) — Package spelling configuration.
- [.gitignore](.gitignore) — Installed dependency exclusions.
- [dist/core/](dist/core/) — Generated shared review engine, rubric, schema, viewer, and source manifest. Regenerate from the monorepo rather than editing these files.

Update this list when files are added, moved, or removed.

### Upstream isolation code

- The vendored `dropSudo.ts` and `linuxCredentials.ts`, plus the root/setpriv shell sequence in `isolate.ts`, come from [OpenAI Codex Action commit 86365089eb2b84e0a8fb0717b304f8bdcb13b20e](https://github.com/openai/codex-action/tree/86365089eb2b84e0a8fb0717b304f8bdcb13b20e).
- The vendored source changes only the explicit `.ts` import and type-only import needed by Node 24. Our launcher runs the core adapter instead of upstream's Codex invocation, with an explicit Node path and the debugger option disabled.
- Tests pin the source and shell-sequence hashes. Review and update them together when upgrading upstream, and preserve the included [Apache license](scripts/vendor/openai-codex-action/LICENSE).
- Local unit tests do not execute privileged account/socket changes. Those changes are part of the real disposable-runner workflow; a successful run does not establish every isolation or failure case.

## Development

- Use Node 24. Run `npm ci` to install the locked dependencies.
- `npm test` checks GitHub input/output handling and the pinned isolation setup without API calls. Core owns the review-engine and report-packaging unit tests.
- `npm run lint` checks JavaScript and native TypeScript syntax. Node 24 runs the small TypeScript isolation entry point directly.
- `npm run format:check` and `npm run spellcheck` check formatting and spelling.
- Run `npx playwright install chromium`, then `npm run probe:browser` to verify that MCP returns image pixels and saves an identical PNG. This fixture check needs no model or API key.

## Testing

- On October 28, 2026, the shared runtime completed a real local Codex review with delegated source inspection, six desktop/mobile screenshots, and a packaged report. All ten tracked runtime processes exited afterward.
- On October 29, 2026, the user reported that the GitHub Action ran successfully. Downloaded-report usability, failure recovery, and timeout behavior still need explicit acceptance checks.

## Deployment

- Before publishing, export core into `dist/core/` from the monorepo. Commit the generated bundle and manifest together; do not edit generated files by hand.

## TODO

### Personal prototype

- Record the tested GitHub workflow and Action revision, inspect the downloaded/extracted report and screenshots, and pin the validated published revision.
- Test failure and timeout handling on the real runner, and record runtime, browser, and model limitations.
- Rename this repository to `design-review-github-action` later; update references and published setup instructions together.

### Friendly alpha

- Add opt-in PR/push triggers and app authentication only after the manual trusted-code flow is established.
