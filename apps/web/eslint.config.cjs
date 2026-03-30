/** @type { import("eslint").Linter.Config[] } */
module.exports = [
  ...require("eslint-config-next"),
  { ignores: ["dist/**", "coverage/**"] },
  {
    files: ["app/**/*.{js,jsx,ts,tsx}", "src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    files: ["tests/**"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
];
