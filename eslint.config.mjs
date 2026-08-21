import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'data/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // A leading underscore is how both halves of this codebase say "this
    // parameter is part of the signature but deliberately unused" — the
    // Worker's createAuth keeps `_env` so it matches the other factories.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Every page here loads its data with `useEffect(() => { void load() })`,
      // which this rule reports because `load` flips a loading flag before it
      // awaits. That is the pattern React documents for an app with no data
      // library, and this app deliberately has none — the contract chose a
      // plain fetch client over react-query because no data is shared between
      // pages. Demoted to a warning rather than switched off: if a genuine
      // cascading-render bug appears, it should still be visible here.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // The Express half runs in Node, not a browser.
    files: ['server/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  {
    // The Worker has neither Node's globals nor the DOM's. Its own tsconfig
    // supplies the types; this only stops `no-undef` firing on fetch/crypto.
    files: ['worker/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.worker, ...globals.browser },
    },
  },
);
