import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@preload': resolve('src/preload'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']
  }
})
