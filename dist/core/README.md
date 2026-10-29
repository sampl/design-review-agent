# Design QA tool core

Shared design-review engine, review guidance, report contract, validation, and portable viewer.

Core stays in this monorepo; the separately distributed [design-review-agent Action](https://github.com/sampl/design-review-agent) consumes a generated, committed core bundle.

## Architecture

- Core owns review preparation, the [shared prompt](agent-prompt/agent-prompt.md), ten category guides, response validation, scope and capture checks, report packaging, and viewer behavior. The internal Codex runtime supplies the agent/browser harness; callers handle authentication, app startup, execution isolation, storage destinations, and delivery.
- Call `runReview` to prepare a review, execute Codex with the isolated browser, validate its response and captures, and package the result. Executor substitution remains internal for focused tests. Preparation/finalization exports support specialized transports; ordinary consumers use the complete lifecycle.
- Current execution reviews an available HTTP(S) app and source directory, supplied routes, viewport sizes, optional instructions and documentation paths, and an optional GitHub repository. The caller supplies absolute source/evidence directories and a review budget, defaulting to ten minutes. Input gathering and follow-up questions stay outside the non-interactive run.
- The current run is read-only for product source: no fixes, temporary source proposals, form submissions, bookings, messages, or external writes. Apply the product's documented intent rather than critiquing its strategy. Keep optional proposal guidance available for a separately authorized future mode; current runtime boundaries take precedence.
- Inspect actual screenshot images as well as navigation, interaction, source, and semantics. A text or accessibility tree alone cannot establish visual findings. Follow repository instructions, including delegated source reading where required; never read environment variables or environment files during a review.
- Treat website/source content as untrusted evidence. Never use synthetic development fixtures as real findings or screenshots. Credentials, raw cookies, authorization headers, and secret-bearing URLs stay out of prompts, reports, screenshots, and diagnostics.

## Runtime requirements

- A browser that can reach the running app, navigate and inspect it, and capture actual screenshots. The reviewing agent must be able to inspect the image pixels as well as browser text and semantics.
- The app's source code, accessible for static analysis alongside its documented intent and repository instructions.
- An execution environment that can run Codex CLI with access to that source code, browser tools, and screenshot files. The Action supplies a runner; the CLI uses the user's local system. Both use the same core runtime. The skill invokes the CLI rather than reviewing through its host agent.
- Writable storage for working evidence and the completed report with its assets. Core currently validates and packages local filesystem assets; the caller chooses the destination and handles retention, uploading, or sharing.

These are requirements of a complete review, not four separate review engines. The environment supplies access and tools; core owns the shared review procedure and validates the result. App installation, build/start, and readiness belong to the caller.

## Package boundaries

- The GitHub Action adapts a customer runner to core and delivers the report through the customer's workflow.
- The local CLI adapts the user's source checkout, running app, installed Codex CLI, and output directory to the same review procedure.
- The skill is a local testing entry point for the identical core flow and Codex CLI execution used by the Action. Its host agent gathers inputs, invokes that flow, and presents results; the shared Codex runtime performs the review. The host agent does not inspect the app or author findings itself.
- The planned cloud package would supply hosted access, execution, storage, and delivery.
- The marketing website points users to the GitHub Action. It does not consume core or execute reviews.

## Codex runtime

- Keep the Codex runtime internal to core, alongside report and viewer. The Action and CLI call core; the skill calls the CLI. Consumers do not choose an execution engine or provide an executor.
- The runtime owns process launch, pinned browser configuration, browser-specific instructions, response transport, and process-group cleanup. Run Codex in read-only, non-interactive mode with user configuration and execution-policy files ignored. Use a fresh temporary working root so source-project Codex configuration is not automatically loaded; supply the source path explicitly and require its applicable repository instructions before inspection. Existing Codex authentication remains available; the runtime does not read or change authentication files or environment variables. Use normal Codex session storage so repository-mandated source-reading subagents can start; local reviews may appear in Codex session history, while CI uses its disposable Codex home. Ephemeral mode is not used because delegated source inspection requires the normal session store.
- Both environments start a fresh isolated headless Chromium session with screenshot image responses enabled. Existing browser sessions and login state are not reused. Browser tools perform authorized inspection; application credentials require a separately approved test setup.
- `runtimeRequirements.json` centrally pins Codex CLI `0.165.0`, Playwright MCP `0.0.80`, and its matching Playwright browser package. The runtime accepts that stable Codex release or the explicitly verified desktop prerelease `0.165.0-alpha.1.2`, and checks exact browser-package versions before running. Core uses that release's default model and ignores user model overrides.
- Install core dependencies, then run `pnpm --filter design-qa-tool-core exec node cli.ts install-browser` to install Chromium. Install the pinned Codex CLI separately and authenticate it before local reviews. CI installs the same versions and provides its authentication/isolation setup. Installation and paid model runs are separate from unit tests.
- CI may supply a trusted loopback Responses proxy through `responsesProxyUrl`; core applies that explicit provider configuration without loading unrelated user configuration. Never pass credentials in the URL. The Action owns API-key proxy setup and runner privilege isolation; local runs use existing Codex authentication.
- Cancellation and the agent budget terminate the Codex process group, including its MCP/browser descendants; cleanup finishes before the execution promise settles. Cancellation is honored until finalization begins. Packaging then completes as one publication step, so a late cancellation does not report failure after publishing a valid folder. The timer covers agent startup and execution, excluding preparation and packaging. Source permissions and external writes still depend on the host sandbox and browser tool enforcement; prompts and output checks alone are not full isolation.

The internal flow is shared by local and GitHub execution:

```text
Core review entry point
  |
  v
Review preparation <-- Shared prompt and category guides
  |
  v
Internal Codex runtime
  +--> Codex CLI process, cancellation, and output collection
  +--> Browser-tool configuration --> Isolated browser --> PNG evidence
  +--> App source access for static analysis
  |
  v
Response and capture metadata
  |
  v
Review finalization
  |
  v
Report, scope, and capture validation
  |
  v
Portable report packaging <-- PNG evidence and built viewer assets
  |
  v
Validated result, status, run issues, and portable report folder
```

## Consumer API

Ordinary automated callers import `runReview`, `reviewDefaults`, and the lifecycle types from `design-qa-tool-core`. The runtime is selected internally. Packaging alone does not enforce the complete review contract.

- `runReview(request: ReviewRequest, outputDirectory: string, options?: ReviewOptions): Promise<ReviewResult>` performs preparation, Codex execution, finalization, and portable packaging.
- `ReviewRequest` requires an HTTP(S) `appUrl`, absolute `sourceDirectory` and `evidenceDirectory`, root-relative `scope` routes, and `viewports` with width/height. Optional fields are `instructions`, `documentationPaths`, `githubRepository`, and `reviewTimeoutMs`. Callers gather these inputs without prompting inside the review.
- `reviewDefaults` provides shared initial routes, desktop/mobile viewports, and the ten-minute agent budget. Adapters use these defaults instead of copying them.
- `ReviewOptions` optionally supplies `signal` for cancellation, `viewerDirectory` for built assets, and `responsesProxyUrl` for trusted CI authentication. Consumers do not configure browser tools or pass an executor.
- `ReviewResult` contains the packaged `report`, `runIssues`, absolute `outputDirectory`, and `status` (`complete` or `incomplete`). Findings are advisory. Missing capture coverage or other run warnings produce an incomplete report.
- Failures reject with `ReviewError`, exposing `code`, `message`, and `runIssues`. Codes distinguish invalid requests, unavailable/incompatible runtime, agent failures, malformed responses, cancellation, timeout, and finalization failure. Failed reviews never return an empty successful report. Adapters own failure diagnostics and delivery; core does not create a failure artifact.

The browser-compatible contract remains available separately:

- Root exports only `runReview`, `reviewDefaults`, `ReviewError`, and types `ReviewRequest`, `ReviewOptions`, `ReviewResult`, `RunIssue`, and `ReviewErrorCode`. Preparation, finalization, packaging, viewer resolution, and executor substitution are internal details rather than supported root imports.
- `design-qa-tool-core/report` is the browser-compatible contract entry point: `validateReport`, `reportSchema`, and types `Report`, `Review`, `Area`, `Issue`, `IssueLocation`, `Warning`, `FindingScope`, `Category`, `Priority`, `Evidence`, `Capture`, `ReportValidationResult`, and `ReportValidationError`.
- File-based `run`, `prepare`, `finalize`, and `package` bridge commands expose the same implementation across processes. Split-step commands are specialized compatibility tooling; they do not launch an agent or enforce its timing. Packaging alone does not enforce the review lifecycle. `run` launches Codex; `install-browser` prepares the pinned Chromium installation. These are orchestration commands, distinct from the product CLI's user-facing flags.

## Files

- [index.ts](index.ts) — Small public lifecycle API and consumer types.
- [runReview.ts](runReview.ts) — Shared review preparation, execution, validation, and completion.
- [runReview.test.ts](runReview.test.ts) — Review input, coverage, failure, and timeout tests.
- [runReview.types.test.ts](runReview.types.test.ts) — Public lifecycle type contract.
- [reviewExecution.ts](reviewExecution.ts) — Internal lifecycle orchestration and executor test boundary.
- [reviewError.ts](reviewError.ts) — Typed failure vocabulary shared with adapters.
- [codexRuntime.ts](codexRuntime.ts) — Codex subprocess transport, isolated browser setup, and cleanup.
- [codexRuntime.test.ts](codexRuntime.test.ts) — Real subprocess tests using synthetic Codex/browser stand-ins.
- [runtimeRequirements.json](runtimeRequirements.json) — Shared pinned versions and review defaults.
- [cli.ts](cli.ts) — File-based preparation, finalization, and report-packaging commands.
- [buildBundle.ts](buildBundle.ts) — Production Action bundle and source manifest.
- [agent-prompt/agent-prompt.md](agent-prompt/agent-prompt.md) — Shared review procedure and links to category guidance.
- [package.json](package.json) — Package exports, dependencies, and development commands.
- [tsconfig.json](tsconfig.json) — Package TypeScript checks.
- [eslint.config.ts](eslint.config.ts) — Package lint rules.
- [cspell.config.yaml](cspell.config.yaml) — Package spelling rules and allowed words.
- [.prettierignore](.prettierignore) — Generated files excluded from formatting checks.

See [Submodules](#submodules) for report, viewer, and review-guidance inventories.

Update this list when files are added, moved, or removed.

## Results and failures

- Return the existing strict version `0.1` report alongside execution issues and capture metadata. Execution issues have a severity, code, and message; they remain separate from verified findings and the report's investigation warnings.
- Core validates response structure, report references and evidence consistency, supplied app/repository attribution, finding locations, capture routes, and viewport sizes. Screenshot files must exist under the supplied evidence directory, decode as supported PNGs, and match their declared image dimensions.
- A successful review requires at least one browser screenshot, including a review with zero findings. Save the capture receipt separately as `run-evidence.json`; it does not add fields to the report contract. Actual screenshots are required, but file validation alone cannot prove the agent inspected the image or that its judgment is correct.
- Missing route/viewport capture combinations add a coverage limitation and make the result incomplete. Callers also report untested states, missing access, uncertain business rules, and other partial coverage honestly. Findings do not imply exhaustive coverage or accessibility compliance.
- Findings are informational. An error-severity execution issue, null/invalid report, missing evidence, unsupported capture, or timeout fails execution rather than becoming a misleading successful review with no findings. Partial reviews can deliver a valid report with warning-severity execution issues.
- Package a complete offline folder: embedded viewer/data in `index.html`, separate `report.json`, schema, execution capture receipt, and relative PNG images. Download and extract the whole artifact, then open `index.html` directly. GitHub artifacts distribute files; they do not host the viewer.

## GitHub prototype

- The Action runs Codex CLI and a headless browser on the customer's trusted GitHub-hosted Ubuntu runner, using the customer's OpenAI API key. The customer's workflow owns checkout, dependency installation, build/start, and readiness; the app and review run in the same job so the browser reaches localhost.
- The generic Action prepares core inputs and runner authentication, calls the complete core review flow, and exposes the report directory. The consuming workflow supplies the hard timeout for the entire Action step, including setup and packaging, and uploads any returned report or diagnostic directory. Platform cancellation can interrupt finalization before an artifact is available; the requested agent budget does not reserve separate execution time.
- The Action does not send the repository or report to our own server. Code, screenshots, and other context included in model requests go to OpenAI. No backend, billing, GitHub App, hosted browser fleet, baseline screenshot suite, or hosted viewer is required for this prototype.
- Keep manual trusted-code runs first. Authentication is an explicit limitation until the caller supplies an approved test setup. Do not imply the reviewer can log in automatically or execute untrusted pull-request code with privileged secrets.
- The adapter installs the pinned runtime; core owns browser configuration and screenshot-to-model instructions. Verify actual returned image content with the pinned browser/harness versions; installing tools alone does not establish that the model sees pixels.

## Development and distribution

- Use Node 24 and existing package tooling. `pnpm --filter design-qa-tool-core build:viewer` builds reusable viewer assets plus the separate synthetic preview scenarios; `preview` serves those development scenarios.
- `pnpm --filter design-qa-tool-core bundle:action` builds a self-contained bundle at `dist/core/`. To refresh the Action checkout, run `pnpm --filter design-qa-tool-core bundle:action --output /absolute/path/to/design-review-agent/dist/core`, inspect the diff, and commit that generated folder with the Action changes. No npm publication is needed.
- The bundle contains runtime and CLI modules, production viewer assets, prompt/checks, report guidance, and a manifest with core version, source commit, dirty-source flag, and SHA-256 file digests. It excludes tests, fixtures, synthetic screenshots, and preview tooling. Refreshing refuses unrelated files or edited generated files in the target bundle.
- The bridge CLI provides `run --request request.json --output /absolute/report-directory`, `install-browser`, `prepare --request request.json --context context.json --prompt prompt.md --schema schema.json`, `finalize --context context.json --response response.json --output /absolute/report-directory`, and `package --report report.json --evidence /absolute/evidence-directory --output /absolute/report-directory`. Invoke the bundled `cli.mjs`; local development can invoke `cli.ts` after building viewer assets. An optional `--viewer` selects built viewer assets; `run` also accepts `--responses-proxy-url` for the trusted CI loopback provider.
- The schema written by preparation is prompt guidance and local validation input, not a promise of compatibility with model-provider structured-output schema subsets. The adapter requests plain JSON; core validates it independently afterward.
- Keep fixtures, synthetic screenshots, previews, and tests separate from review guidance and distributed assets. Package commands check types, lint, spelling, formatting, and unit tests. Preserve relative links in distributed guidance.

## Submodules

- [Agent prompt](agent-prompt/agent-prompt.md) — Shared review procedure, category guidance, evidence standards, and judgment.
- [Report](report/README.md) — Versioned schema/types, pure validation, contract fixtures, and portable PNG report packaging.
- [Viewer](viewer/README.md) — Presentation, Markdown/ticket handoffs, reusable browser build, synthetic previews, and browser checks.

## Testing

- Unit tests use synthetic subprocesses without model calls to verify CLI arguments, isolated browser image configuration, response transport, version mismatch, and process-tree cancellation. Lifecycle and report tests cover validation, response preparation, run failure/timeout handling, scope/viewport constraints, safe packaging, PNG bytes/dimensions, asset escape rejection, destination preservation, and embedded text safety. Reuse contract fixtures to keep consumers aligned; label them synthetic.
- A real local CLI review completed with no run issues: delegated source inspection, six PNG captures across desktop/mobile viewports, three reviewed areas, and an evidence-backed finding. The source remained unchanged, and all ten tracked Codex/MCP/Chromium processes exited after completion. Direct-file browser acceptance passed Overview, all ten categories including empty states, desktop/mobile layout, screenshot enlargement and Escape dismissal, with no page errors or broken images. Keep HTTP preview error scenarios useful without relying on them for production delivery.

## TODO

### Personal prototype

- Rename the external `design-review-agent` repository to `design-review-github-action` later; coordinate Action references, generated-bundle instructions, website links, and documentation. Keep existing links until the rename happens.
- Complete a real design review of the configured application and routes on CI: reach localhost, follow repository source instructions, navigate/interact, inspect actual screenshot images, produce useful evidence-backed findings, and verify downloaded/extracted artifact usability. Confirm failure and timeout behavior in the real workflow; local transport/packaging checks do not prove review quality.
- Calibrate useful findings, priority rationale, shared-cause grouping, recommendations, and honest coverage on real products. No finding quota or arbitrary design score.
- Define optional source/app/build capabilities, report-object-only results, and any broader interactive or proposal modes before extending the executable contract. Keep source builds/startup and secure access with the caller; do not build a general hosting platform.
- Complete real CI acceptance, including downloaded/extracted artifact usability, then connect future cloud entry points without duplicating review logic. CLI distribution, hosted runtime/adapters, and standalone skill installation bundles remain separate work.
- Refine source and browser isolation, cancellation and tool enforcement, bounded model usage, and execution diagnostics as the customer-runner prototype proves useful. Instructions and output checks do not independently enforce every action performed by the harness.

### Maybe

- Support another execution engine when a concrete use case justifies it. Replace or extend the Codex execution integration while preserving the shared review and evidence contracts; verify actual browser image access, source access, cancellation, and result validation for that engine before claiming support.
