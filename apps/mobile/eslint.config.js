/** @type { import("eslint").Linter.Config[] } */
module.exports = [
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  { ignores: ["node_modules/**", "dist/**", ".expo/**", "coverage/**", ".tamagui/**"] },
];
