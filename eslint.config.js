import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
    {
        ignores: ["dist", "build", "coverage", "node_modules", "src-tauri/target", "src-tauri/gen", "**/*.min.js"],
    },
    {
        files: ["**/*.{ts,tsx,js,jsx}"],
        extends: [js.configs.recommended, ...tseslint.configs.recommended, sonarjs.configs.recommended],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: {
            react,
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        settings: {
            react: { version: "detect" },
        },
        rules: {
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            "react/jsx-uses-react": "off",
            "react/self-closing-comp": "warn",

            "no-console": ["warn", { allow: ["warn", "error"] }],
            eqeqeq: ["error", "always", { null: "ignore" }],
            "prefer-const": "warn",
            "no-var": "error",
            "object-shorthand": "warn",

            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],

            "sonarjs/cognitive-complexity": ["warn", 20],
            "sonarjs/no-duplicate-string": "off",
            "sonarjs/no-nested-conditional": "off",
            "sonarjs/void-use": "off",
            "sonarjs/no-nested-functions": "warn",
            "sonarjs/todo-tag": "warn",

            "react/jsx-no-comment-textnodes": "off",
        },
    },
    {
        files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
        rules: {
            "sonarjs/no-duplicate-string": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "no-console": "off",
        },
    },
    prettier,
);
