# OpenAI Codex Action helpers

[Action README](../../README.md)

- `dropSudo.ts` and `linuxCredentials.ts` come from [OpenAI Codex Action commit 86365089eb2b84e0a8fb0717b304f8bdcb13b20e](https://github.com/openai/codex-action/tree/86365089eb2b84e0a8fb0717b304f8bdcb13b20e).
- Preserve the accompanying Apache license. Local adaptations add the explicit TypeScript import extension and type-only import required by Node 24, plus erased non-null assertions for the invoked script path and group names after the existing equal-length check. Exact test normalization removes these adaptations before checking the upstream digest; runtime isolation behavior is unchanged.
- The Action adapter tests pin upstream source hashes and the launcher's privilege-removal sequence. Review upstream upgrades before changing those hashes.
- These helpers permanently remove runner privileges. Execute them only on a fresh disposable Linux runner after setup is complete.
