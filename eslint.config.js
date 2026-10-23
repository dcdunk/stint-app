import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'src-tauri/target/', 'src-tauri/gen/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
