# @pilog/ui

A thin barrel package over `src/renderer/src/components/ui`. It exists so that
the pilog.dev marketing site can consume the same shadcn primitives the Electron
app uses without forking files (and then drifting). Adding a primitive to the
renderer makes it available here by adding one barrel line in `src/`.

## Source of truth

`src/renderer/src/components/ui/` — edit primitives there. Do **not** copy a file
into this package.

## Adding a new primitive

1. Generate or modify the primitive under `src/renderer/src/components/ui/<name>.tsx`.
2. Add `src/<name>.tsx` here:

   ```tsx
   // Barrel: single source of truth lives in src/renderer/src/components/ui/<name>.tsx.
   export * from '@renderer/components/ui/<name>'
   ```

3. Add an `"./<name>": "./src/<name>.tsx"` entry to this package's `exports`.
4. Consume via `import { ... } from '@pilog/ui/<name>'`.

## Consumers

- `site/` — Next 15 + Tailwind v4. Resolves `@renderer/*` via a `next.config.ts`
  webpack alias plus a `tsconfig.json` paths entry; pulls classes into Tailwind's
  content scan via `@source` directives in `site/src/app/globals.css`. Tokens
  live in `site/src/app/globals.css` and `src/renderer/src/assets/main.css`;
  those two files must move in lockstep (this is the only drift surface left).
- The Electron renderer itself continues to import primitives directly via
  `@renderer/components/ui/*`; the barrel is for the site.
