import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/FocusApp.tsx", "app/InkflowOpening.tsx", "app/FlowApp.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off"
    },
  },
  globalIgnores([
    ".next/**", "out/**", "build/**", "next-env.d.ts",
    "design/**", "docs/**", "video/**", ".venv/**"
  ]),
]);

export default eslintConfig;
