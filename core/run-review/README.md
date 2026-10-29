# Run review

[Core README](../README.md)

Run a review from start to finish: prepare shared inputs, run the agent, check its report and screenshot coverage, and save a report folder that can be opened on another computer. Callers use the small public API documented by core.

## Architecture

- The production entry point selects Codex; one internal lifecycle module owns preparation, execution, and finalization. Runtime and error modules import lifecycle contracts only as types, so implementation dependencies stay one-way.
- Local reviews and GitHub reviews follow the same preparation, execution, validation, and completion steps. Tests can replace the agent execution step internally; callers cannot choose a different executor through the public API.
- Prepare the request, prompt, and expected response format before execution. Before packaging, check the response structure, its app and repository details, requested routes and screen sizes, and real screenshot evidence.
- Find shared files beside the built Action entry points, or in the package directory when running from source. Prefer the Action's own files over any parent checkout. Keep the supported report-guidance directory names for both layouts.
- Cancellation or reaching the agent time limit stops Codex and its browser processes. Execution finishes only after those processes have been cleaned up.
- Cancellation is accepted until finalization begins: the point where core starts checking and packaging the response. Once that work begins, core finishes it so a late cancellation does not turn an already-published result into a failure.
- The agent timer includes startup and execution, but excludes preparation and packaging. A GitHub step timeout must also allow for installation and report delivery; a forced platform cancellation can prevent an artifact from being produced.

## Important files

- `runReview.ts` — Thin production entry point that selects Codex and exposes the public review contract.
- `reviewLifecycle.ts` — Internal request/response contracts, preparation, execution budget, cancellation, validation, and finalization.
- `reviewError.ts` — Named error types shared with the apps that call core.
- `assetRoot.ts` — Find shared files in the source package and built Action bundle.

## API

- The public root API chooses the runtime. Preparing inputs, checking and packaging results, locating viewer files, and replacing agent execution for tests remain implementation details.
- The schema describes the response the agent should return and lets core check that response. Core requests plain JSON and validates it itself; the schema is not guaranteed to work with every provider's structured-output feature.

**Results and failures**

- **Complete:** core accepted the report and required screenshot coverage, with no execution issues. This does not mean every state was tested or that the app meets accessibility standards.
- **Incomplete:** a valid report is available, but execution warnings or missing page/screen-size combinations limit its coverage. The report explains what remains unchecked.
- **Failed:** core could not produce a valid review. Invalid or missing reports, error-level execution issues, missing evidence, unsupported captures, and timeouts are failures. They must not appear as successful reviews with no findings.
- Findings are recommendations. Even a severe finding does not itself fail execution. Report investigation warnings describe uncertain design concerns; `runIssues` describe problems running the review.
- A successful review needs at least one actual browser screenshot, even when it finds no issues. Core checks report structure, attribution, locations, requested routes and screen sizes, and PNG files and dimensions. These checks cannot prove the agent's judgment is correct.

## Development

Use the [local CLI](../../cli/README.md) to run reviews and install the browser. The GitHub Action calls the bundled core API directly. Preparation, validation, and packaging remain internal lifecycle operations.

## Testing

- Lifecycle tests cover input validation, execution failures, cancellation, timeouts, attribution, supplied routes/viewports, missing screenshot coverage, and late cancellation during final publication. Public API tests ensure callers cannot replace the agent execution step.
- Asset lookup tests cover nested source modules, choosing the bundle’s own files first, and missing guidance. Verify source and bundled preparation/packaging from an unrelated working directory when moving assets.
- On October 28, 2026, a real local CLI review completed with delegated source inspection, six desktop/mobile screenshots, three reviewed areas, and an evidence-backed finding. Product source stayed unchanged, no execution issues were reported, and all ten tracked runtime processes exited.
- The owner confirmed a successful GitHub Action run on October 29, 2026. Downloaded-artifact usability and failure/timeout scenarios remain separate acceptance checks.

## TODO

### Personal prototype

- Check the downloaded/extracted GitHub report, review its evidence and coverage, and exercise failure and timeout cases. The first successful Action run is confirmed; these additional acceptance checks are not yet recorded.
- Define optional app/source/build capabilities, report-only results, and interactive or proposal modes before extending the current contract. Keep source builds/startup and secure access with the caller.
