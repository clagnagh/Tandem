import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import base from '@tandem/config/eslint';

export default defineConfig([
  ...base,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [nextVitals],
    // eslint-plugin-react's version detection uses an API removed in ESLint 10.
    settings: { next: { rootDir: 'apps/web/' }, react: { version: '19.3' } },
  },
]);
