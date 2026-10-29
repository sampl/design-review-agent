# Design review Github action

Run a design review of your app from GitHub Actions.

[Repository overview](../README.md) · [Development guidelines](../DEVELOPERS.md).

The Action entry point is now in `github-action/`. Update earlier root-level references to `sampl/design-review-agent/github-action@…`.

## 1. Choose the app and review scope

Read your repository instructions and existing workflows. Identify:

- The app directory and its dependency installation, build, and server commands.
- Any runtime setup, services, or test data the app needs in CI.
- The HTTP(S) URL the server will use, such as `http://127.0.0.1:4321`.
- The routes to review, such as `["/", "/services/"]`.
- The repository-relative source directory, such as `my-app` or `.` for the whole checkout.
- The viewport sizes and any extra review focus. The defaults cover desktop and mobile.

Use pages that a fresh browser profile can access without signing in. Automatic app authentication is not currently provided. Coding agents should inspect the repository to find working commands and ask for requirements they cannot determine.

Use a fresh, disposable GitHub-hosted Ubuntu runner and trusted code. The review permanently drops runner privileges for the rest of the job, so finish privileged setup before invoking it. Do not schedule another privileged task or another review afterward in the same job.

Selected source and screenshots are sent to OpenAI in model requests. Repository and report data are not sent to our own server. The source scope guides inspection; it does not isolate filesystem access. Browser instructions and tool configuration are not complete isolation guarantees. Keep this manual trusted-code workflow separate from untrusted pull requests.

## 2. Add your OpenAI API key

This action uses your OpenAI key for inference. In your repository, open **Settings → Secrets and variables → Actions**, choose **New repository secret**, and create `OPENAI_API_KEY` with your OpenAI API key as its value.

## 3. Create the Github action workflow file

Create `.github/workflows/design-review.yml` in your repository using the template below. Before running it:

1. Replace `REPLACE_WITH_REVIEWED_COMMIT_SHA` with the full SHA of a reviewed, published commit from [this Action repository](https://github.com/sampl/design-review-agent). Pin a commit for reproducible runs.
2. Replace `YOUR_INSTALL_COMMAND`, `YOUR_BUILD_COMMAND`, and `YOUR_START_COMMAND` with commands that work for your app. Add any runtime setup steps before them. Set each `working-directory` to the app directory, relative to the checkout; use `.` for a root-level app. If your app needs no build, remove that step.
3. Match `APP_URL` and the Action's `app-url` to the server's address and port. Configure your start command to use that port and keep running in the background.
4. Change `paths`, `source-scope`, `viewports`, and `review-focus` for your app. `source-scope` is relative to the checkout, independent of the commands' `working-directory`.

```yaml
name: Design review
on: workflow_dispatch
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-26.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false

      # Add your app's runtime setup and required services before installation.
      - name: Install app dependencies
        working-directory: my-app
        run: YOUR_INSTALL_COMMAND

      - name: Build app
        working-directory: my-app
        run: YOUR_BUILD_COMMAND

      - name: Start app
        working-directory: my-app
        run: |
          YOUR_START_COMMAND > "$RUNNER_TEMP/app.log" 2>&1 &

      - name: Wait for app readiness
        env:
          APP_URL: http://127.0.0.1:4321
        run: |
          for attempt in {1..60}; do
            if curl --fail --silent --output /dev/null --max-time 2 "$APP_URL"; then
              exit 0
            fi
            sleep 2
          done
          echo "App did not become ready at $APP_URL"
          cat "$RUNNER_TEMP/app.log"
          exit 1

      - uses: sampl/design-review-agent/github-action@REPLACE_WITH_REVIEWED_COMMIT_SHA
        id: review
        timeout-minutes: 15
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

Keep app startup, readiness, review, and artifact upload in the same job so the browser can reach localhost. The readiness check expects a successful HTTP response; point it at a health endpoint if the base URL is unsuitable. Adjust its bounded wait if your app takes longer to start.

The Action installs its own Node 24, Codex, and browser dependencies. Your app may need its own runtime setup before installation and startup.

The Action input `timeout-minutes` limits agent execution. The step timeout bounds the entire Action, including installation and packaging; give it extra time beyond the agent budget. The example allows 10 minutes for the agent, 15 for the Action step, and 30 for the job. Adjust all three together if your app or review needs more time.

The published [action.yml](action.yml) defines these inputs for the Action's `with` block:

- `openai-api-key` (required): OpenAI API key supplied through a repository secret.
- `app-url` (required): HTTP(S) base URL without credentials, query, or fragment. The app must already be running.
- `paths` (default: `'["/"]'`): JSON array of 1–20 same-origin root-relative routes.
- `source-scope` (default: `.`): Repository-relative source directory. Guides inspection; does not isolate filesystem access.
- `viewports` (default: desktop 1440×900 and mobile 390×844): JSON array of 1–5 objects with integer `width` and `height`, each 240–3840.
- `review-focus` (default: empty): Extra review instructions, up to 10,000 characters.
- `timeout-minutes` (default: `10`): Integer 1–30; agent execution budget. Set a longer step timeout separately.
- `design-qa-artifact-directory-path` (default: a unique temporary directory): Optional new report directory whose parent already exists. Existing destinations are rejected to avoid stale reports.

## 4. Validate and run

Compare your workflow inputs with [action.yml](action.yml) at the exact Action commit you pinned. Coding agents must read that published README and interface before configuring the workflow; stop if they are unavailable rather than guessing inputs.

Check that all placeholders are replaced, the selected routes exist, the source directory is correct, and the app setup and readiness commands work in CI. Keep `workflow_dispatch`, `contents: read`, checkout credentials disabled, bounded timeouts, and the failure-aware artifact upload condition shown above. Do not add automatic PR/push triggers or hosted report storage as part of this setup.

Commit the workflow to your repository's default branch. With repository write access, open **Actions → Design review → Run workflow** and select the trusted branch to review. The user starting the run needs repository write access; the workflow token uses only `contents: read`.

## 5. Download and read the report

Open the completed workflow run and download the **design-review** artifact. Extract the entire archive and open `index.html` directly in your browser. Keep the report folder together, including its screenshots and JSON. GitHub artifacts are downloads; they do not host the report as a website.

The Action returns two step outputs, available through `steps.review.outputs` in this workflow:

- `design-qa-artifact-directory-path`: Report or diagnostic directory to upload, including on failure.
- `review-status`: `complete`, `incomplete`, or `failed`.

Interpret `review-status` as follows:

- `complete`: the review finished without execution issues and met the required screenshot coverage. It does not mean every state was tested or every possible issue was found.
- `incomplete`: a valid report is available, but coverage gaps or run warnings limit its conclusions. Read those limitations alongside the findings.
- `failed`: no valid result could be produced. Missing or invalid reports, browser/runtime failures, and agent timeouts fail the Action. An available diagnostic artifact may contain only `run-status.json`.

Findings are recommendations; even severe design findings do not fail execution. The upload condition preserves any available report or diagnostic directory when the review fails. A hard platform timeout can interrupt finalization before the Action returns an artifact path, so an artifact is not guaranteed in that case.

## Implementation

- `githubActionAdapter.mjs` maps GitHub inputs and outputs to the bundled core lifecycle.
- `isolate.ts` launches the adapter after dropping disposable-runner privileges.
- [Build scripts](build-scripts/README.md) generate the committed runtime in `dist/core/` from local core source.
- [Vendored helpers](vendor/openai-codex-action/README.md) document upstream isolation code and its license.
- Production dependencies are installed with pinned pnpm and the repository's frozen lockfile before authentication and isolation setup. Core source is not compiled during a workflow run.

## TODO

### Personal prototype

- Verify the new Action path and dependency setup on a disposable GitHub runner.
- Record the tested workflow revision, inspect the downloaded report and screenshots, and test failure and timeout recovery.

### Friendly alpha

- Add opt-in PR/push triggers and app authentication after the manual trusted-code flow is established.
