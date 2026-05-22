#!/usr/bin/env node

import { spawn } from 'node:child_process'

const [, , tag, ...files] = process.argv
const timeoutMs = Number.parseInt(process.env.GH_RELEASE_UPLOAD_TIMEOUT_MS ?? '600000', 10)

if (!tag || files.length === 0) {
  console.error('Usage: node scripts/upload-release-assets.mjs <tag> <file...>')
  process.exit(2)
}

const child = spawn('gh', ['release', 'upload', tag, ...files, '--clobber'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  console.error(`gh release upload exceeded ${Math.round(timeoutMs / 1000)}s; terminating`)
  child.kill('SIGTERM')

  setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL')
  }, 10_000).unref()
}, timeoutMs)

child.on('error', (error) => {
  clearTimeout(timer)
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  clearTimeout(timer)
  if (timedOut) process.exit(124)
  if (signal) {
    console.error(`gh release upload exited from signal ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
