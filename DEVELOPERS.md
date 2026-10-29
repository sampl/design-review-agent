# Developing the design review agent

This repository owns the review engine, local CLI, local testing skill, and GitHub Action. See [README.md](README.md) for module entry points and the [Action README](github-action/README.md) for workflow setup.

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
- Core is built from local source and committed in `github-action/dist/core/`, including its instructions, schema, validator, and viewer. The Action does not fetch core source during a run.

### Data and permissions

- Selected source and screenshots are sent to OpenAI in model requests. Repository and report data are not sent to our own server.
- Raw model output and working orchestration files stay outside uploaded artifacts. Valid reports contain structured JSON and relative screenshot files; execution diagnostics are separate in `run-status.json`. A timeout must not become a successful empty report.
- Run manually on trusted code with repository write access. Keep the key away from untrusted pull requests. The source scope guides inspection; it does not isolate filesystem access. Browser instructions and tool configuration are not complete isolation guarantees.

### Modules

- [Core](core/README.md) owns shared review rules, defaults, browser execution, validation, and report generation.
- [CLI](cli/README.md) provides checkout-based local review commands.
- [Skill](skill/README.md) gathers inputs and presents CLI results.
- [GitHub Action](github-action/README.md) owns workflow inputs, runner setup, isolation, outputs, and its committed runtime build.

Keep module and submodule READMEs alongside their code. Shared contributor tooling belongs at the repository root.

### Upstream isolation code

- The vendored `dropSudo.ts` and `linuxCredentials.ts`, plus the root/setpriv shell sequence in `isolate.ts`, come from [OpenAI Codex Action commit 86365089eb2b84e0a8fb0717b304f8bdcb13b20e](https://github.com/openai/codex-action/tree/86365089eb2b84e0a8fb0717b304f8bdcb13b20e).
- The vendored source changes only the explicit `.ts` import and type-only import needed by Node 24. Our launcher runs the core adapter instead of upstream's Codex invocation, with an explicit Node path and the debugger option disabled.
- Tests pin the source and shell-sequence hashes. Review and update them together when upgrading upstream, and preserve the included [Apache license](github-action/vendor/openai-codex-action/LICENSE).
- Local unit tests do not execute privileged account/socket changes. Those changes are part of the real disposable-runner workflow; a successful run does not establish every isolation or failure case.

## Development

- Use Node 24 and pnpm 9.15.9. Run `pnpm install --frozen-lockfile` from the repository root.
- One workspace lockfile and root development dependencies serve every module. Core, CLI, and Action manifests own their runtime dependencies and module-specific commands.
- `pnpm test` runs all core, CLI, viewer, and Action unit tests through Vitest without model calls.
- `pnpm ts`, `pnpm lint`, `pnpm format:check`, and `pnpm spellcheck` check the workspace. `pnpm format` applies formatting.
- The single root TypeScript configuration covers handwritten TypeScript, including browser code and tests. Generated output and vendored helpers are excluded from ordinary checks; dedicated Action tests check vendor integrity.
- `pnpm build:viewer` builds viewer assets and synthetic development previews. `pnpm build:action` generates the committed Action runtime.
- Keep packages private. CLI and skill installation and package publication are deferred; local testing uses this checkout.

## Testing

- On October 28, 2026, the shared runtime completed a real local Codex review with delegated source inspection, six desktop/mobile screenshots, and a packaged report. All ten tracked runtime processes exited afterward.
- On October 29, 2026, the user reported that the GitHub Action ran successfully. Downloaded-report usability, failure recovery, and timeout behavior still need explicit acceptance checks.

## Migration provenance

- Core, CLI, and skill files were moved as a current-file snapshot from Directed revision `e1414243a74000fc42bd10214a1b02bb38d4f166`; Git history was not imported.
- Directed retains the cloud service, marketing website, and business planning. Future cloud integration should consume a versioned core package once distribution is designed.

## Deployment

- Run `pnpm build:action`, inspect the generated diff and manifest, and commit the runtime together with source changes. Never edit generated files by hand.
- Consumers use `sampl/design-review-agent/github-action@…`. The earlier root-level Action path does not exist in new revisions.

## TODO

### Personal prototype

- Verify the relocated Action and frozen production dependency installation on a disposable runner. Check report delivery, failure recovery, and timeout behavior.
- Record the validated workflow and Action revision before recommending a published commit.
