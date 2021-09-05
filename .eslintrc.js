// https://dev.to/nabeelahmed1721/setting-up-typescript-with-eslint-prettier-on-vscode-25na
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  ignorePatterns: [".eslintrc.js"],
  extends: [
    "standard",
    "eslint:recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:promise/recommended",
    "prettier",
  ],
  parserOptions: {
    ecmaVersion: 2015
  },
  plugins: ["prettier", "@typescript-eslint"],
  rules: {
    "comma-dangle": ["error", "always-multiline"],
    "no-empty-pattern": ["off"],
    "no-undef": ["error"],
    "no-var": ["error"],
    "object-curly-spacing": ["error", "always"],
    indent: ["off"],
    "prettier/prettier": [
      "error",
      {
        // https://prettier.io/docs/en/options.html
        singleQuote: true,
        semi: false,
        trailingComma: 'all'
      },
    ],
  },
  env: {
    // change as necessary
    node: true,
  },
};
