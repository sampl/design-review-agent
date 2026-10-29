# Codex runtime

[Core README](../README.md)

Run Codex CLI with a fresh browser, collect its response, and stop its processes when execution ends. Review callers do not need to manage those processes or set up the browser.

## Architecture

- This module starts Codex, supplies browser-specific instructions, collects the response, and stops the processes it started. It is part of core, alongside the report and viewer modules.
- `runtimeRequirements.json` specifies exact supported versions: Codex CLI `0.165.0`, Playwright MCP `0.0.80`, and the matching Playwright browser package. Core also accepts the verified desktop prerelease `0.165.0-alpha.1.2`; it checks exact browser-package versions before running. It uses the supported CLI release's default model.
- Local runs preserve existing Codex authentication and configuration files. To keep execution consistent, core ignores user configuration and execution-policy files and starts in a fresh temporary working directory. It supplies the source path explicitly and requires the applicable repository instructions to be read before source inspection.
- Codex uses its normal session store so source-reading subagents can start. Local reviews may appear in Codex session history; GitHub uses a disposable Codex home. Ephemeral mode, which does not keep session history, prevents this delegated inspection and is not used.
- Each run starts a separate Chromium browser without a visible window. It does not reuse existing browser sessions or login state. Apps that require sign-in need an approved way for the review to access them.
- GitHub supplies a trusted local connection to the Responses API through `responsesProxyUrl`. This proxy handles requests on the runner; its URL must not contain credentials. The Action handles API keys and keeps the runner separate from other work. Core uses the supplied connection without loading unrelated configuration.
- The review runner controls the time limit and when validation and report publication begin. This module reports execution as finished only after it has stopped its processes.

## Important files

- `codexRuntime.ts` — Version checks, browser installation and setup, starting Codex, collecting its response, and stopping its processes. Its internal browser path and configuration helpers are shared with the probe.
- `runtimeRequirements.json` — Supported runtime versions, default viewports, and agent budget shared by review callers.
- `codexRuntime.test.ts` — Runtime launch, version, authentication proxy, and process cancellation checks using stand-ins.
- `browserProbe.ts` — Development check of real browser measurements, inline PNG responses, and identical saved screenshots; uses the runtime browser configuration and exact dependency checks. It does not call a model or require an API key, and is excluded from the distributed Action bundle.

## API

- `executeCodex` consumes prepared review inputs and a cancellation signal, returning parsed response data for the runner to validate. Callers use the public core review API rather than invoking the runtime directly.
- `installBrowser` installs the pinned Chromium runtime; the root file-based bridge exposes it as its browser-installation command.
- Tests can replace Codex and the browser with stand-ins. Keep that ability internal; callers cannot use it to choose another review engine.

## Development

- Install workspace dependencies and a supported Codex CLI, then complete local Codex login yourself. Use the browser-installation command in the parent README.
- After installing Chromium, run `pnpm --filter design-qa-tool-core probe:browser` to verify real MCP image transport. The probe prints its result and temporary screenshot path.
- Keep required Codex, browser packages, accepted prereleases, viewports, and agent budget in one requirements file. Consumers use those shared values rather than maintaining separate copies.
- Keep source requirements beside the runtime module; bundle tooling retains their existing location beside the distributed entry points.

## Testing

- Tests start stand-in processes instead of calling a model. They check launch arguments, browser setup that returns screenshot pixels, plain JSON responses, exact versions, and cancellation of Codex, the browser, and any processes they start.
- Version rejection happens before review execution. Invalid or oversized responses fail without publishing raw model output.

## TODO

### Personal prototype

- Improve source/browser isolation, cancellation enforcement, bounded model use, and execution diagnostics as real customer-runner use reveals gaps.
