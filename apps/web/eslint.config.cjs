/** @type { import("eslint").Linter.Config[] } */
module.exports = [
  ...require("eslint-config-next"),
  { ignores: ["dist/**"] },
  {
    files: ["app/**", "src/**"],
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
