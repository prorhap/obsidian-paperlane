import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  plugins: { "@typescript-eslint": tseslint.plugin },
  rules: {
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-this-alias": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "no-control-regex": "error",
    "no-restricted-syntax": ["error",
      { selector: "CallExpression[callee.name=/^(setTimeout|clearTimeout)$/]", message: "Use window timers for Obsidian compatibility." },
      { selector: "CallExpression[callee.object.name='document'][callee.property.name='createElement']", message: "Use Obsidian createEl helpers." }
    ],
  },
});
