import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly"
      }
    }
  },
  {
    files: ["examples/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        alert: "readonly"
      }
    }
  }
];
