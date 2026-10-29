import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "core/**/*.test.ts",
      "cli/**/*.test.ts",
      "github-action/**/*.test.ts",
    ],
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
