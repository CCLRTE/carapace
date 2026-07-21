import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-invalid-void-type": "off",
    },
  },
  {
    files: ["examples/react-native/metro.config.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
