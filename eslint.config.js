// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // SDK 58's eslint-config-expo turns on the React Compiler rules as errors. This app
    // does not use the React Compiler, and ~45 existing spots across 25 screens trip them
    // (setState in effects, refs read during render). They are advice about re-renders,
    // not crashes, so they are warnings here until those screens are reworked one by one.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);
