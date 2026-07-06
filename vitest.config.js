import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The default ignores would pick up *.test.js inside docs/upstream-pr/,
    // but those files target the upstream repo's jest runner (different
    // globals + different relative import paths), not this monorepo's
    // vitest. Exclude them explicitly.
    exclude: ['**/node_modules/**', '**/dist/**', '**/types/**', '**/docs/**']
  }
})
