module.exports = {
  extends: ["../.eslintrc.cjs"],
  plugins: ["react-hooks", "react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
};
