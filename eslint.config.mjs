import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // `docs/` is a separate VitePress project with its own toolchain — never lint
  // it (especially its built bundles under docs/.vitepress/dist) with the app's config.
  { ignores: ['out', 'dist', 'node_modules', '.claude', 'docs', '**/*.d.ts'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off'
    }
  },
  {
    rules: {
      // TypeScript already reports undefined identifiers; the core rule lacks
      // browser/node globals and produces false positives.
      'no-undef': 'off',
      // The only rule eslint-config-prettier switched off for this config; it can
      // misfire on Prettier's line breaks. Inlined to drop that dependency.
      'no-unexpected-multiline': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  }
)
