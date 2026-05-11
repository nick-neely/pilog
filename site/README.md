# pilog.dev

Public website for the Pilog desktop app. Built with Next.js App Router and Tailwind CSS v4.

## Local development

From the repository root:

```sh
pnpm site:install   # install site dependencies
pnpm site:dev       # start the Next.js dev server (http://localhost:3000)
pnpm site:build     # production build
pnpm site:typecheck # type-check site code
```

Or from inside `site/`:

```sh
pnpm install
pnpm dev
```

## Vercel deployment

Set `site/` as the **Root Directory** in the Vercel project settings for `pilog.dev`. Vercel auto-detects the Next.js framework. No additional build configuration is required beyond pointing at the `site/` directory.

The `vercel.json` in this directory confirms the framework setting.

## Design system

The site mirrors the desktop app's design tokens one-to-one. Color tokens (OKLCH), typography (Source Serif 4 / IBM Plex Sans / IBM Plex Mono), radii, and accent discipline are defined in `src/app/globals.css` and match `src/renderer/src/assets/main.css` in the Electron app.

See `DESIGN.md` and `PRODUCT.md` at the repository root for the Reading-Room Journal design system specification.
