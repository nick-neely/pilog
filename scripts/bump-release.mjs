#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const packagePaths = ['package.json', 'app/package.json']

function usage() {
  console.error(`Usage:
  pnpm release:bump preview <X.Y.Z-preview.N> [--commit] [--tag] [--push] [--dry-run]
  pnpm release:bump stable <X.Y.Z> [--commit] [--tag] [--push] [--dry-run]

Examples:
  pnpm release:bump preview 0.1.0-preview.3 --commit --tag
  pnpm release:bump stable 0.1.0 --commit --tag --push`)
}

function run(command, args, options = {}) {
  const rendered = [command, ...args].join(' ')
  if (options.dryRun) {
    console.log(`[dry-run] ${rendered}`)
    return ''
  }

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  })

  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  return options.capture ? result.stdout.trim() : ''
}

function validateVersion(channel, version) {
  if (channel === 'stable') {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error(`Stable releases must use X.Y.Z, got "${version}".`)
    }
    return
  }

  if (channel === 'preview') {
    if (!/^\d+\.\d+\.\d+-preview\.\d+$/.test(version)) {
      throw new Error(`Preview releases must use X.Y.Z-preview.N, got "${version}".`)
    }
    return
  }

  throw new Error(`Unknown channel "${channel}". Expected "preview" or "stable".`)
}

function assertCleanTree({ dryRun }) {
  const status = run('git', ['status', '--short'], { capture: true, dryRun: false })
  if (status.length === 0) return

  if (dryRun) {
    console.log('[dry-run] Working tree is dirty; a real run would stop before changing versions.')
    return
  }

  throw new Error(
    `Working tree is not clean. Commit or stash existing changes before bumping a release:\n${status}`
  )
}

function writePackageVersion(packagePath, version, { dryRun }) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  const previous = pkg.version
  pkg.version = version
  const next = `${JSON.stringify(pkg, null, 2)}\n`

  if (dryRun) {
    console.log(`[dry-run] ${packagePath}: ${previous} -> ${version}`)
    return
  }

  writeFileSync(packagePath, next)
  console.log(`${packagePath}: ${previous} -> ${version}`)
}

function main() {
  const [channel, version, ...flags] = process.argv.slice(2)
  const flagSet = new Set(flags)

  if (!channel || !version || flagSet.has('--help') || flagSet.has('-h')) {
    usage()
    process.exit(channel && version ? 0 : 1)
  }

  const knownFlags = new Set(['--commit', '--tag', '--push', '--dry-run'])
  for (const flag of flagSet) {
    if (!knownFlags.has(flag)) {
      throw new Error(`Unknown flag "${flag}".`)
    }
  }

  const shouldCommit = flagSet.has('--commit')
  const shouldTag = flagSet.has('--tag') || flagSet.has('--push')
  const shouldPush = flagSet.has('--push')
  const dryRun = flagSet.has('--dry-run')
  const tag = `v${version}`

  if (shouldTag && !shouldCommit) {
    throw new Error(
      'Use --commit with --tag or --push so the release tag points at the version bump.'
    )
  }

  validateVersion(channel, version)
  assertCleanTree({ dryRun })

  for (const packagePath of packagePaths) {
    writePackageVersion(packagePath, version, { dryRun })
  }

  run('node', ['scripts/validate-release-version.mjs', version], { dryRun })

  if (shouldCommit) {
    run('git', ['add', ...packagePaths], { dryRun })
    run('git', ['commit', '-m', `chore: bump version to ${version}`], { dryRun })
  } else {
    console.log('Version files updated. Commit with:')
    console.log(`  git add ${packagePaths.join(' ')}`)
    console.log(`  git commit -m "chore: bump version to ${version}"`)
  }

  if (shouldTag) {
    run('git', ['tag', tag], { dryRun })
  } else {
    console.log(`Create the release tag with: git tag ${tag}`)
  }

  if (shouldPush) {
    run('git', ['push', 'origin', 'main'], { dryRun })
    run('git', ['push', 'origin', tag], { dryRun })
  } else if (shouldTag) {
    console.log('Push when ready with:')
    console.log('  git push origin main')
    console.log(`  git push origin ${tag}`)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
