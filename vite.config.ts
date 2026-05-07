// This file exists ONLY so the shadcn CLI's framework detector recognises this
// project as a Vite project. PiLog uses electron-vite, whose real configuration
// lives in `electron.vite.config.ts`. shadcn globs for `**/{next,vite,astro,
// app}.config.*` at the project root; without a matching file, `shadcn init`,
// `shadcn add`, and `shadcn apply` all abort with "could not detect a supported
// framework".
//
// Do NOT put runtime configuration here. The real Vite config for the renderer,
// main, and preload bundles lives in `electron.vite.config.ts`. The build
// pipeline never invokes the bare `vite` binary, so this no-op config is never
// executed by anything we ship.

import { defineConfig } from 'vite'

export default defineConfig({})
