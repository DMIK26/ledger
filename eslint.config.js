import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Privacy rule: amounts may only be turned into text by src/domain/money.ts,
// so privacy mode can never be bypassed by a stray toFixed or Intl call.
const moneyRules = [
  {
    selector: "MemberExpression[object.name='Intl'][property.name='NumberFormat']",
    message: 'Format money with fmtMoney() from src/domain/money.ts.',
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: 'Format money with fmtMoney() from src/domain/money.ts.',
  },
  {
    selector: "CallExpression[callee.property.name='toLocaleString']",
    message: 'Format money with fmtMoney() from src/domain/money.ts.',
  },
];

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'playwright-report', 'test-results', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'no-restricted-syntax': ['error', ...moneyRules],
    },
  },
  {
    files: ['src/domain/money.ts', 'src/**/*.test.{ts,tsx}', 'e2e/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
