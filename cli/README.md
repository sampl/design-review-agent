# Design QA tool CLI

Run a design review from your computer and save the report locally. The CLI calls [core](../core/README.md), so it uses the same Codex CLI, browser setup, review rules, and report format as the GitHub Action.

The local skill calls this CLI too. Its purpose is to make the real review flow easy to test locally.

## Architecture

- Collect the app URL, source location, review scope, and report destination from command-line flags.
- Use the installed compatible Codex CLI and existing login. Core manages the review and browser; the CLI presents the result.
- Reserve a new report directory and use temporary storage for working screenshots. After the run, remove working files and keep the packaged screenshots with the report.
- Save a diagnostic when a run fails, and forward Ctrl-C to core so it can stop the review.

Start the app and wait until it is ready before using the CLI. The review reads product source but does not edit it.

**Files**

- [cli.ts](cli.ts) — Terminal signals and process exit status.
- [runCli.ts](runCli.ts) — Input mapping, local destinations, core invocation, and diagnostic delivery.
- [runCli.test.ts](runCli.test.ts) — Core-boundary input, cancellation, output, and failure tests.

## User experience

- The command prints JSON containing `status`, `outputDirectory`, and `runIssues`.
- `complete` means the review finished without execution issues. `incomplete` means a valid report is available but it describes coverage gaps or other run limitations. Both exit with code 0; findings do not fail the command.
- Failures exit with code 1. Cancellation exits with code 130. Ctrl-C requests cancellation through core.
- A failed run saves `run-status.json` in the reserved output directory. If flags could not be parsed or the directory could not be reserved, the error is printed directly and no diagnostic artifact is created. The CLI does not save raw model output.
- Open the finished `index.html` directly in a browser. Keep the entire report folder together when moving or sharing it, including JSON and screenshots. No report server is needed.

## Development

**Setup**

- Use Node 24 and install workspace dependencies with pnpm from the repository root.
- Install a supported Codex CLI version listed in the [runtime README](../core/codex-runtime/README.md). Complete `codex login` yourself if needed; credentials do not belong in review flags or instructions.
- Run `pnpm --filter design-review-agent-core exec node cli.ts install-browser` to install the pinned browser.
- The installer needs network access and permission to write to the operating system's browser cache. A restricted agent sandbox may need access granted outside the repository; otherwise cache-lock retries can stall installation. A normal terminal needs no special repository cache setup.
- Run `pnpm --filter design-review-agent-core build:viewer` to build the report viewer.

**Running a review**

- Start the app, then run `pnpm --filter design-review-agent-cli review --app-url <url> --source <absolute-source-directory> --output <new-absolute-report-directory>` from the repository root.
- Use absolute paths: pnpm runs this command from the CLI package directory. The output parent must already exist, and the report directory must be new so an earlier review is never overwritten.
- Repeat `--route /path` to choose pages. The default is `/`.
- Repeat `--viewport WIDTHxHEIGHT` to choose screen sizes. Defaults are desktop 1440x900 and mobile 390x844.
- Optional flags are `--focus <text>`, repeated `--documentation <path>`, `--github-repository <url>`, and `--timeout-minutes <integer>` from 1 to 60. The default agent budget is ten minutes; setup and report packaging take additional time.
- Use `--help` to see the options without starting Codex, installing anything, or making a model request.

## Testing

- Run `pnpm ts`, `pnpm lint`, `pnpm spellcheck`, `pnpm format:check`, and `pnpm test` from the repository root.
- Unit tests run once with Vitest and check inputs passed to core, incomplete results, preservation of existing output, failure diagnostics, and cancellation. They substitute core and make no model calls.
- A real local test passed on October 28, 2026. Codex reviewed the marketing page at desktop and mobile sizes, delegated source inspection, and produced six actual screenshots with no execution issues. Source files stayed unchanged and all observed runtime processes exited.
- The report opened directly from disk. Images, categories, screenshot enlargement, Escape dismissal, and narrow layout all passed browser checks. Review quality still needs calibration across more products.
