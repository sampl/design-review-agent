# Design QA tool core

Shared design-review engine, review guidance, report contract, validation, and portable viewer.

Core stays in this monorepo; the separately distributed [design-review-agent Action](https://github.com/sampl/design-review-agent) consumes a generated, committed core bundle.

## Architecture

- Core owns review preparation, the [shared prompt](agent-prompt/agent-prompt.md), ten category guides, response validation, scope and capture checks, report packaging, and viewer behavior. Callers supply the agent/browser harness and handle access, startup, execution isolation, storage, and delivery.
- Prepare a review, run the prepared prompt in the caller's harness, then finalize the response. The combined runner accepts an executor and abort signal; the prepare/finalize boundary supports separate GitHub Action steps without duplicating the review procedure.
- Current execution reviews an available HTTP(S) app and source directory, supplied routes, viewport sizes, optional instructions and documentation paths, and an optional GitHub repository. The caller supplies absolute source/evidence directories and a review budget, defaulting to ten minutes. Input gathering and follow-up questions stay outside the non-interactive run.
- The current run is read-only for product source: no fixes, temporary source proposals, form submissions, bookings, messages, or external writes. Apply the product's documented intent rather than critiquing its strategy. Keep optional proposal guidance available for a separately authorized future mode; current runtime boundaries take precedence.
- Inspect actual screenshot images as well as navigation, interaction, source, and semantics. A text or accessibility tree alone cannot establish visual findings. Follow repository instructions, including delegated source reading where required; never read environment variables or environment files during a review.
- Treat website/source content as untrusted evidence. Never use synthetic development fixtures as real findings or screenshots. Credentials, raw cookies, authorization headers, and secret-bearing URLs stay out of prompts, reports, screenshots, and diagnostics.

## Files

- [runReview.ts](runReview.ts) — Shared review preparation, execution, validation, and completion.
- [runReview.test.ts](runReview.test.ts) — Review input, coverage, failure, and timeout tests.
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
- The generic Action prepares core inputs, configures the agent/browser, passes the requested review budget, finalizes output, and exposes the report directory. The consuming workflow supplies the hard timeout for the entire Action step, including setup and packaging, and uploads any returned report or diagnostic directory. Platform cancellation can interrupt finalization before an artifact is available; the requested agent budget does not reserve separate execution time.
- The Action does not send the repository or report to our own server. Code, screenshots, and other context included in model requests go to OpenAI. No backend, billing, GitHub App, hosted browser fleet, baseline screenshot suite, or hosted viewer is required for this prototype.
- Keep manual trusted-code runs first. Authentication is an explicit limitation until the caller supplies an approved test setup. Do not imply the reviewer can log in automatically or execute untrusted pull-request code with privileged secrets.
- Browser installation and screenshot-to-model capability belong to the adapter. Verify actual returned image content with the pinned browser/harness versions; installing tools alone does not establish that the model sees pixels.

## Development and distribution

- Use Node 24 and existing package tooling. `pnpm --filter design-qa-tool-core build:viewer` builds reusable viewer assets plus the separate synthetic preview scenarios; `preview` serves those development scenarios.
- `pnpm --filter design-qa-tool-core bundle:action` builds a self-contained bundle at `dist/core/`. To refresh the Action checkout, run `pnpm --filter design-qa-tool-core bundle:action --output /absolute/path/to/design-review-agent/dist/core`, inspect the diff, and commit that generated folder with the Action changes. No npm publication is needed.
- The bundle contains runtime and CLI modules, production viewer assets, prompt/checks, report guidance, and a manifest with core version, source commit, dirty-source flag, and SHA-256 file digests. It excludes tests, fixtures, synthetic screenshots, and preview tooling. Refreshing refuses unrelated files or edited generated files in the target bundle.
- The bridge CLI provides `prepare --request request.json --context context.json --prompt prompt.md --schema schema.json`, `finalize --context context.json --response response.json --output /absolute/report-directory`, and `package --report report.json --evidence /absolute/evidence-directory --output /absolute/report-directory`. Invoke the bundled `cli.mjs`; local development can invoke `cli.ts` after building viewer assets. An optional `--viewer` selects built viewer assets.
- The schema written by preparation is prompt guidance and local validation input, not a promise of compatibility with model-provider structured-output schema subsets. The adapter requests plain JSON; core validates it independently afterward.
- Keep fixtures, synthetic screenshots, previews, and tests separate from review guidance and distributed assets. Package commands check types, lint, spelling, formatting, and unit tests. Preserve relative links in distributed guidance.

## Submodules

- [Agent prompt](agent-prompt/agent-prompt.md) — Shared review procedure, category guidance, evidence standards, and judgment.
- [Report](report/README.md) — Versioned schema/types, pure validation, contract fixtures, and portable PNG report packaging.
- [Viewer](viewer/README.md) — Presentation, Markdown/ticket handoffs, reusable browser build, synthetic previews, and browser checks.

## Testing

- Unit tests cover validation, response preparation, run failure/timeout handling, scope/viewport constraints, safe packaging, PNG bytes/dimensions, asset escape rejection, destination preservation, and embedded text safety. Reuse contract fixtures to keep consumers aligned; label them synthetic.
- Verify packaged reports directly through `file://`, including screenshot enlargement and keyboard dismissal. Keep HTTP preview error scenarios useful without relying on them for production delivery.

## TODO

### Personal prototype

- Complete a real design review of the configured application and routes on CI: reach localhost, follow repository source instructions, navigate/interact, inspect actual screenshot images, produce useful evidence-backed findings, and verify downloaded/extracted artifact usability. Confirm failure and timeout behavior in the real workflow; local transport/packaging checks do not prove review quality.
- Complete direct-file browser visual verification; the current computer-use browser blocks local-file navigation. Unit/static packaging checks and real browser PNG transport do not replace that check.
- Calibrate useful findings, priority rationale, shared-cause grouping, recommendations, and honest coverage on real products. No finding quota or arbitrary design score.
- Define optional source/app/build capabilities, report-object-only results, and any broader interactive or proposal modes before extending the executable contract. Keep source builds/startup and secure access with the caller; do not build a general hosting platform.
- Connect future skill, local/CI CLI, and cloud entry points to the same review boundary while documenting capability differences. CLI distribution, hosted runtime/adapters, and standalone skill installation bundles remain separate work.
- Refine source and browser isolation, cancellation and tool enforcement, bounded model usage, and execution diagnostics as the customer-runner prototype proves useful. Instructions and output checks do not independently enforce every action performed by the harness.
