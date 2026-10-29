# Build scripts

[Core README](../README.md)

Build reusable viewer assets for local reviews, development previews, and Action packaging.

## Architecture

- `buildViewer.ts` compiles the viewer TypeScript and browser validation, then copies HTML, CSS, and schema into reusable files.
- Production assets contain no synthetic fixtures. The preview module builds its own development reports separately.
- The GitHub Action owns bundle assembly, provenance, and destination integrity checks in its own build module.

## Development

- Run `pnpm build:viewer` from the repository root to build production viewer assets and separate synthetic previews.
- Run the root quality checks and unit tests after changing asset packaging.
