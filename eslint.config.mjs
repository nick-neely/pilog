import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig } from 'eslint/config'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/.next',
      // Next.js emits this file; triple-slash refs are required for route types.
      '**/next-env.d.ts'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier,
  {
    // shadcn-canonical files. `pnpm dlx shadcn add` and `shadcn apply`
    // regenerate these verbatim, so any in-file annotation we add gets erased
    // on the next install. Relax the two rules that conflict with shadcn idiom
    // — explicit return types on component functions, and the fast-refresh
    // single-export rule (button.tsx co-exports `buttonVariants`). All other
    // strictness still applies here.
    files: ['src/renderer/src/components/ui/**/*.{ts,tsx}', 'src/renderer/src/lib/utils.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-refresh/only-export-components': 'off'
    }
  },
  {
    // Shared UI package: barrel `export *` re-exports; Vite refresh rule does not apply.
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },
  {
    // Marketing site (Next.js App Router): metadata exports; no Vite HMR.
    files: ['site/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  {
    // Node CLI/build hooks (.mjs) and electron-builder CJS hooks (.cjs): no TS
    // signatures; CJS must use require().
    files: ['scripts/**/*.{mjs,cjs}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    // `detectPlatform()` needs `navigator`; post-mount setState avoids SSR/CSR mismatch.
    files: [
      'site/src/components/platform-download.tsx',
      'site/src/components/preview-download.tsx'
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off'
    }
  }
)
