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
- `timeout-minutes`: integer 1–30, default 10. Sets the requested model review budget; it does not enforce runtime. Set `timeout-minutes` on the caller's Action step for a hard limit.
- `design-qa-artifact-directory-path`: optional new directory whose parent must exist. Defaults to a unique temporary directory. Existing destinations are rejected to avoid stale reports.
- Outputs: `design-qa-artifact-directory-path` identifies the report or diagnostic directory; `review-status` is `complete`, `incomplete`, or `failed`.

Findings, including severe findings, do not fail execution. Missing/invalid reports, browser/runtime failures, and timeouts fail execution. Coverage gaps remain visible as incomplete reviews. Upload the artifact even when the review step fails.

The example limits the whole Action step to 10 minutes, including installation, review, and report packaging; the job limit remains 25 minutes. A platform timeout can interrupt finalization before any artifact path is returned, so a report or diagnostic artifact is not guaranteed on timeout.

## Execution

- Runs entirely in the caller's job, reusing its checkout and server; no backend, clone, billing, or hosted viewer.
- Uses the pinned official OpenAI Codex Action for the API proxy and privilege isolation. Codex CLI/proxy retain upstream's installation default.
- Preparation links the disposable runner account's default `.codex` directory to the trusted temporary Codex home. This keeps proxy and browser configuration available when Ubuntu sudo drops `CODEX_HOME`. Existing files, directories, and symlinks at that default path cause preparation to fail; no existing configuration is replaced.
- The official Action drops sudo privileges. Complete browser installation and application setup first.
- Codex follows repository instructions and can delegate source inspection. Reviewers do not edit source or submit forms, make purchases, or change application data. Secrets, environment values/files, and credential registries are excluded from inspection.
- Read-only browser evaluation measures observed geometry and scroll offsets. It must not fetch, navigate through code, submit forms, or mutate the DOM or application.
- Playwright MCP 0.0.80 and its exact matching Chromium runtime are installed before privileges drop. The browser uses an isolated profile. Required MCP initialization fails clearly if browser tooling is unavailable.
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

- [action.yml](action.yml) — Composite Action inputs, browser installation, Codex execution, and report finalization.
- [scripts/designReview.mjs](scripts/designReview.mjs) — Input validation, core requests, browser configuration, default account configuration, and report or failure diagnostics.
- [scripts/designReview.test.mjs](scripts/designReview.test.mjs) — Input, orchestration, default account configuration, and bundled-core report packaging tests.
- [scripts/browserProbe.mjs](scripts/browserProbe.mjs) — Local browser probe for read-only measurements, inline PNG responses, and identical saved screenshots without a model or API key.
- [scripts/fixtures/browser-probe.png](scripts/fixtures/browser-probe.png) — Captured browser fixture for the bundled-core report packaging test.
- [package.json](package.json) and [package-lock.json](package-lock.json) — Runtime requirements, commands, and pinned dependencies.
- [cspell.config.yaml](cspell.config.yaml) — Package spelling configuration.
- [.gitignore](.gitignore) — Installed dependency exclusions.
- [dist/core/](dist/core/) — Generated shared review engine, rubric, schema, viewer, and source manifest. Regenerate from the monorepo rather than editing these files.

Update this list when files are added, moved, or removed.

## Development

- Node 24; `npm ci` installs exact locked dependencies.
- `npm test`: input/path validation, orchestration, and failure reporting without API calls.
- `npm run lint`: JavaScript syntax checks. Runtime JavaScript has no separate type checker.
- `npm run format:check` and `npm run spellcheck`: formatting and spelling.
- `npx playwright install chromium`, then `npm run probe:browser`: local fixture verifies that MCP returns PNG pixels and an identical saved screenshot; no model or API key needed.
- Build/export the monorepo core into `dist/core/` before publishing this repository. Commit its manifest and generated bundle together.

## TODO

- Validate the complete GitHub run against a configured application; inspect the downloaded report and evidence, record runtime/browser/model limitations, and pin the validated published Action revision.
- Pin a verified Codex CLI and API proxy version after the complete runner validation.
- Add opt-in PR/push triggers and authentication setup only after the manual trusted-code flow is proven.
