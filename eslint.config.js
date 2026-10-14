import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'native/**', 'src/generated/**', 'public/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-constant-condition': 'off',
      'prefer-const': 'warn',
    },
  },
  {
    files: ['src/sim/**/*.ts', 'src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/render/**', '**/ui/**', '**/audio/**', '**/input/**', 'three', 'three/*'], message: 'sim/core must not import render, ui, audio, input or three.' },
        ],
      }],
    },
  },
);
