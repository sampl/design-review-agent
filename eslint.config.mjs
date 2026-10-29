import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/**", "github-action/vendor/**"]),
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // These validators deliberately reject control characters in untrusted report text.
    files: [
      "core/html-viewer/model.ts",
      "core/report-format/validateReport.ts",
    ],
    rules: { "no-control-regex": "off" },
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
]);
