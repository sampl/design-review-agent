// Locates shared assets beside a bundle or one level above source lifecycle modules.
import { access } from "node:fs/promises";

export async function resolveAssetRoot(
  moduleUrl: string = import.meta.url,
): Promise<URL> {
  for (const root of [new URL("./", moduleUrl), new URL("../", moduleUrl)]) {
    try {
      await access(new URL("agent-prompt/agent-prompt.md", root));
      return root;
    } catch {
      // Try the source layout only after checking for a self-contained bundle.
    }
  }
  throw new Error("Shared review assets could not be located.");
}
