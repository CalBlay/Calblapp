import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      "build/**",
      "coverage/**",
      // Next-generated (triple-slash ref); do not lint
      "next-env.d.ts",
      // Capacitor / native: bundled web assets, not app source
      "android/**",
      "ios/**",
      // Service worker & static JS (CommonJS / no TS rules)
      "public/**/*.js",
      // One-off Node scripts (require, ad-hoc encodings)
      "scripts/**",
      "**/*.js",
      "**/*.cjs",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Large legacy surface: keep as warnings so `eslint .` exits 0 while improving types incrementally.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-assign-module-variable": "warn",
      "prefer-const": "warn",
      "react/display-name": "warn",
    },
  },
];

export default eslintConfig;
