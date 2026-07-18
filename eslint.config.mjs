import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // ESLint CLp(`eslint .`)로 실행할 때 빌드 산출물·생성 파일·설정 파일은 검사 대상에서 제외한다.
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.open-next/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      '*.config.{js,cjs,mjs,ts}',
      'postcss.config.*',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];

export default eslintConfig;
