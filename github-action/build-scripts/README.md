# Action build scripts

[Action README](../README.md)

Generate the committed Action runtime from this repository's core source.

## Architecture

- `buildBundle.ts` bundles core's public entry point and automation bridge, viewer assets, runtime requirements, review guidance, and module documentation.
- Exclude tests, fixtures, synthetic screenshots, and preview tooling.
- Record this repository, the core source directory, source commit, dirty-source state, and SHA-256 file digests in the manifest. Dirty state covers core, Action build scripts, and workspace dependency inputs; generated output does not make a clean build dirty.
- Prepare the bundle in a temporary directory and replace the previous bundle as a whole. Refuse unrelated files, symlinks, or generated files with local edits.
- Keep the bundle-relative entry points and asset locations stable for the Action adapter.

## Development

- Run `pnpm build:action` from the repository root. The default output is `github-action/dist/core/`.
- An optional `--output /absolute/path/to/core` supports temporary verification builds; the destination must be dedicated to the bundle and named core.
- Review and commit the generated runtime and manifest with source changes. No cross-repository export or npm publication is needed.

## Testing

- Verify manifest digests, required assets, exclusions, and bundled exports after building.
- Exercise invalid-input and report-packaging commands from an unrelated working directory without starting a model.
