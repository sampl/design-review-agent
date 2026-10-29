// Setup builds this bundle from core; keep its trusted type assertion here.
export async function loadBundledCore(): Promise<
  typeof import("../core/index.ts")
> {
  const bundleUrl = new URL("./dist/core/index.mjs", import.meta.url);
  return (await import(bundleUrl.href)) as typeof import("../core/index.ts");
}
