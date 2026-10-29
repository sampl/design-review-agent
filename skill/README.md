# Design QA tool skill

Get a design review on any repo.

This skill calls the design review CLI, which in turn calls the design review `core` module.

This is our local testing entry point for the same flow used by the GitHub Action.

## Architecture

- [SKILL.md](SKILL.md), named `design-review`, tells the host agent how to prepare and run the review.
- Before starting, gather the running app URL, readable source location, pages or concerns to focus on, permissions, and a new report destination.
- The caller starts the app and checks that it is ready. Core then runs without follow-up questions and keeps product source read-only.
- Local execution uses the compatible installed Codex CLI and existing login, preserving user configuration. Each review starts a fresh isolated browser, matching the Action; it does not reuse an existing browser login.
- Follow the CLI README for setup and commands. Use the sibling packages in this checkout together; there is no standalone skill installation yet.

## Testing

- Validate skill metadata and links

## TODO

- Design standalone skill installation with a compatible CLI and core. Installation is not available yet.
