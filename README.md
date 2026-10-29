# Design review agent

GitHub Action for agent-driven design QA against a running application and its checkout. Reviews visual design and interaction quality, inspects relevant source, and packages the shared Design QA report viewer with screenshot evidence.

## Usage

Use a disposable GitHub-hosted Ubuntu runner. Check out trusted code, install dependencies, build the app, start its server, and wait for readiness **before** invoking this Action. The browser runs in the same job and can reach localhost.

```yaml
name: Design review
on: workflow_dispatch
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-26.04
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      # Install, build, start your application, and wait for readiness here.
      - uses: sampl/design-review-agent@main
        id: review
        timeout-minutes: 10
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          app-url: http://127.0.0.1:4321
          paths: '["/", "/services/"]'
          source-scope: my-app
          viewports: '[{"width":1440,"height":900},{"width":390,"height":844}]'
          review-focus: Check hierarchy, responsive layout, and navigation.
          timeout-minutes: "10"
      - uses: actions/upload-artifact@v7
        if: ${{ always() && steps.review.outputs.design-qa-artifact-directory-path != '' }}
        with:
          name: design-review
          path: ${{ steps.review.outputs.design-qa-artifact-directory-path }}
          if-no-files-found: error
```

The example follows `main` for development. Pin the Action to a reviewed, published commit SHA for a reproducible setup. Download and extract the artifact, then open `index.html`; GitHub artifacts do not host HTML as a website. Failed runs may contain only `run-status.json` explaining the failure.

## Configuration

- `openai-api-key`: required repository secret; the user configures it themselves.
- `app-url`: required HTTP(S) base URL, without credentials, query, or fragment.
- `paths`: JSON array of 1–20 same-origin root-relative routes; defaults to `["/"]`.
- `source-scope`: repository-relative source directory; defaults to the whole checkout. Guides source inspection; it does not isolate filesystem access.
- `viewports`: JSON array of 1–5 width/height objects, each dimension 240–3840; defaults to desktop 1440×900 and mobile 390×844.
- `review-focus`: optional extra review instructions.
- `timeout-minutes`: integer 1–30, default 10. Core enforces this agent execution timeout. Also set `timeout-minutes` on the caller's Action step to bound installation and packaging.
- `design-qa-artifact-directory-path`: optional new directory whose parent must exist. Defaults to a unique temporary directory. Existing destinations are rejected to avoid stale reports.
- Outputs: `design-qa-artifact-directory-path` identifies the report or diagnostic directory; `review-status` is `complete`, `incomplete`, or `failed`.

Findings, including severe findings, do not fail execution. Missing/invalid reports, browser/runtime failures, and timeouts fail execution. Coverage gaps remain visible as incomplete reviews. Upload the artifact even when the review step fails.

The example limits the whole Action step to 10 minutes, including installation, review, and report packaging; the job limit remains 25 minutes. Set a longer step timeout than the agent timeout when the full agent budget is required. A platform timeout can interrupt finalization before any artifact path is returned, so a report or diagnostic artifact is not guaranteed on timeout.

## Execution

- Runs entirely in the caller's job, reusing its checkout and server; no backend, clone, billing, or hosted viewer.
- Calls the bundled core's normal `runReview` entry point. Core owns Codex CLI launch, browser configuration, cancellation, response validation, coverage, and report packaging; this adapter only maps GitHub inputs, provisions the environment, and publishes outputs/diagnostics.
- Uses the pinned official OpenAI Codex Action in setup-only mode: no prompt is supplied and it does not run the review. It checks repository write access, installs the core-required Codex CLI/proxy release, starts the API-key proxy, and prepares its nonsecret connection information. The review receives only the loopback proxy URL, without the API key.
- Before core starts, the pinned upstream Linux privilege boundary removes sudo, restricts privileged service sockets, clears supplementary groups and capability sets, and enables `no_new_privs`. These irreversible account/host changes require a fresh disposable GitHub-hosted Linux runner. Do not reuse the job for another privileged task or another review.
- Complete browser installation and application setup before the review. A separate temporary Codex home holds only setup configuration; existing account Codex configuration is not replaced. Core ignores the user Codex configuration file and explicitly selects its browser and the prepared proxy.
- Codex follows repository instructions and can delegate source inspection. Reviewers do not edit source or submit forms, make purchases, or change application data. Secrets, environment values/files, and credential registries are excluded from inspection.
- Read-only browser evaluation measures observed geometry and scroll offsets. It must not fetch, navigate through code, submit forms, or mutate the DOM or application.
- Browser and Codex versions come from the bundled core runtime requirements. The Action lockfile must match the browser package versions; a unit test checks this. Playwright MCP and its matching Chromium runtime are installed before privileges drop. The browser uses an isolated profile. Required MCP initialization fails clearly if browser tooling is unavailable.
- Screenshot calls omit `filename`: this pinned MCP version then returns actual inline image pixels and saves an automatically named file in the evidence directory. Supplying `filename` suppresses inline images. Text/accessibility snapshots alone are insufficient for a visual finding.
- The shared core supplies guidance, schema, validation, and the standalone viewer. Its committed bundle in `dist/core/` is built from the Directed monorepo; the Action does not fetch core source at runtime.
- Raw model output and orchestration files stay outside uploaded artifacts. Valid reports include structured JSON and relative screenshot paths. Runtime diagnostics remain separate in `run-status.json`; timeouts cannot become successful empty reports.
- Model requests send selected source and images to OpenAI. No repository or report data goes to our server.
- Use manual runs on trusted code with repository write access. Do not expose the key to untrusted pull requests. Browser tool configuration guides review behavior; source scope and browser instructions are not isolation guarantees.

## Setup instructions for coding agents

1. Read this README and `action.yml` from the published Action repository. Stop if unavailable; use its actual documented interface.
2. Read the caller's instructions and existing workflows. Identify the application, routes, relevant source directory, viewport sizes, and a working server command; ask for missing requirements.
3. Add only `workflow_dispatch`, `contents: read`, bounded Action-step and job timeouts, and checkout with credentials disabled. Install/build/start the app and wait for its URL before invoking the Action in the same job. Pin a reviewed, published Action SHA.
4. Pass `${{ secrets.OPENAI_API_KEY }}`. Never inspect secret or environment values. Tell the user to set `OPENAI_API_KEY` in **Settings → Secrets and variables → Actions** themselves.
5. Upload the artifact with the failure-aware condition above. Do not configure hosted report storage or automatic triggers.
6. Validate configuration against the published Action interface. Explain any remaining user setup. Once available on the default branch, run via **Actions → Design review → Run workflow**, then download and extract the artifact.

## Files

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

## Development

- Node 24; `npm ci` installs exact locked dependencies.
- `npm test`: adapter boundary and upstream isolation regression checks without API calls. Core owns the model/browser orchestration and report-packaging unit tests.
- `npm run lint`: JavaScript and native TypeScript syntax checks. Node 24 executes the small TypeScript isolation entry point directly.
- `npm run format:check` and `npm run spellcheck`: formatting and spelling.
- `npx playwright install chromium`, then `npm run probe:browser`: local fixture verifies that MCP returns PNG pixels and an identical saved screenshot; no model or API key needed.
- Build/export the monorepo core into `dist/core/` before publishing this repository. Commit its manifest and generated bundle together.
- Shared-runtime validation on October 28, 2026 completed a real local Codex CLI review with delegated source inspection, six desktop/mobile screenshot captures, and a packaged report. All ten tracked runtime processes exited after completion. The GitHub API proxy and privileged runner setup still require the manual workflow validation below.

The vendored `dropSudo.ts` and `linuxCredentials.ts`, and the root/setpriv shell sequence in `isolate.ts`, come from [OpenAI Codex Action commit 86365089eb2b84e0a8fb0717b304f8bdcb13b20e](https://github.com/openai/codex-action/tree/86365089eb2b84e0a8fb0717b304f8bdcb13b20e). The vendored source changes only the explicit `.ts` import and type-only import required by Node 24. The launcher runs our core adapter instead of upstream's Codex invocation, with an explicit Node path and disabled debugger option. Tests pin the upstream source and shell sequence digests; review and update them together when upgrading upstream. Preserve the included [Apache license](scripts/vendor/openai-codex-action/LICENSE). Actual account/socket changes require manual validation on a disposable GitHub runner; local unit tests do not execute privileged setup.

## TODO

- Validate the complete GitHub run against a configured application; inspect the downloaded report and evidence, record runtime/browser/model limitations, and pin the validated published Action revision.
- Rename this repository to `design-review-github-action` after validating the interface; update references and published setup instructions together.
- Validate the pinned Codex CLI/proxy release with the complete runner flow before publishing.
- Add opt-in PR/push triggers and authentication setup only after the manual trusted-code flow is proven.
