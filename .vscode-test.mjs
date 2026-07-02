import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    label: "unitTests",
    files: "out/tests/unit/**/*.test.js",
    mocha: {
      ui: "bdd",
      timeout: 5000,
    },
  },
  {
    label: "integrationTests",
    files: "out/tests/integration/**/*.test.js",
    mocha: {
      ui: "bdd",
      timeout: 10000,
    },
  },
]);
