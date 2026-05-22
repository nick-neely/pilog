import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const stagingRoot =
  process.env.PILOG_ELECTRON_STAGING_DIR || join(homedir(), '.cache', 'pilog-electron-app')
const configArgIndex = process.argv.indexOf('--config')
const configPath =
  configArgIndex >= 0 && process.argv[configArgIndex + 1]
    ? resolve(repoRoot, process.argv[configArgIndex + 1])
    : join(repoRoot, 'electron-builder.yml')
const electronBuilderArgs = process.argv.slice(2).filter((arg, index, args) => {
  if (arg === '--config') return false
  if (index > 0 && args[index - 1] === '--config') return false
  return true
})

rmSync(stagingRoot, { recursive: true, force: true })
run('pnpm', ['--filter', 'pilog-app', 'deploy', '--legacy', '--prod', stagingRoot], {
  cwd: repoRoot,
  ci: true
})
rmSync(join(stagingRoot, 'node_modules'), { recursive: true, force: true })
run(
  'pnpm',
  [
    'install',
    '--prod',
    '--ignore-scripts',
    '--no-frozen-lockfile',
    '--config.auto-install-peers=true',
    '--config.node-linker=hoisted',
    '--config.package-import-method=copy'
  ],
  { cwd: stagingRoot, ci: true }
)

const generatedConfig = writeElectronBuilderConfig(configPath)
run('pnpm', [
  'exec',
  'electron-builder',
  '--projectDir',
  stagingRoot,
  '--config',
  generatedConfig,
  ...electronBuilderArgs
])

function writeElectronBuilderConfig(sourceConfigPath) {
  const baseConfig = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
  const sourceConfig = readFileSync(sourceConfigPath, 'utf8')
  const isExtendedConfig = /^extends:\s+electron-builder\.yml/m.test(sourceConfig)
  const publishBlock = isExtendedConfig ? extractTopLevelBlock(sourceConfig, 'publish') : null
  const electronVersion = resolveElectronVersion()
  let config = replaceTopLevelBlock(
    baseConfig,
    'directories',
    [
      'directories:',
      `  buildResources: ${join(repoRoot, 'build')}`,
      `  output: ${join(repoRoot, 'dist')}`
    ].join('\n')
  )

  config = replaceTopLevelBlock(config, 'files', buildFilesBlock())
  config = config
    .replaceAll('from: resources/icon.png', `from: ${join(repoRoot, 'resources', 'icon.png')}`)
    .replaceAll(
      'from: resources/tray-icon.png',
      `from: ${join(repoRoot, 'resources', 'tray-icon.png')}`
    )
    .replace(
      /^afterPack:\s+.+$/m,
      `afterPack: ${join(repoRoot, 'scripts', 'verify-packaged-runtime.cjs')}`
    )

  if (!/^electronVersion:/m.test(config)) {
    config = config.replace(/^productName:\s+(.+)$/m, `$&\nelectronVersion: ${electronVersion}`)
  }

  if (publishBlock) {
    config = replaceTopLevelBlock(config, 'publish', publishBlock)
  } else if (!isSameFile(sourceConfigPath, join(repoRoot, 'electron-builder.yml'))) {
    throw new Error(
      `Unsupported electron-builder config ${sourceConfigPath}. This staging script only supports electron-builder.yml and configs that extend it.`
    )
  }

  const outputPath = join(
    mkdtempSync(join(tmpdir(), 'pilog-electron-builder-')),
    'electron-builder.yml'
  )
  writeFileSync(outputPath, config)
  return outputPath
}

function buildFilesBlock() {
  return [
    'files:',
    '  - out/**',
    '  - package.json',
    '  - from: node_modules',
    '    to: node_modules',
    '    filter:',
    "      - '**/*'",
    "      - '!**/{CHANGELOG.md,README.md,README,readme.md,readme}'",
    "      - '!**/{test,tests,__tests__,fixtures,__fixtures__,coverage,.nyc_output,.cache,.vite,.turbo}/**'",
    "      - '!**/*.{test,spec}.{js,jsx,cjs,mjs,ts,tsx,cts,mts}'",
    "      - '!**/*.d.ts'",
    "      - '!**/*.map'",
    "      - '!**/*.tsbuildinfo'",
    "      - '!**/.bin/**'",
    "      - '!**/.DS_Store'",
    "      - '!**/Thumbs.db'",
    "  - '!**/*.map'",
    "  - '!**/*.tsbuildinfo'",
    "  - '!**/.DS_Store'",
    "  - '!**/Thumbs.db'",
    "  - '!**/{test,tests,__tests__,fixtures,__fixtures__,coverage,.nyc_output,.cache,.vite,.turbo}/**'",
    "  - '!**/*.{test,spec}.{js,jsx,cjs,mjs,ts,tsx,cts,mts}'"
  ].join('\n')
}

function extractTopLevelBlock(contents, key) {
  const match = contents.match(new RegExp(`^${key}:\\n(?:^[ \\t].*\\n?)+`, 'm'))
  return match?.[0].trimEnd() ?? null
}

function replaceTopLevelBlock(contents, key, replacement) {
  const expression = new RegExp(`^${key}:\\n(?:^[ \\t].*\\n?)+`, 'm')
  if (!expression.test(contents)) {
    throw new Error(`Could not find top-level ${key} block in electron-builder config`)
  }
  return contents.replace(expression, `${replacement}\n`)
}

function resolveElectronVersion() {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
  )
  const version = packageJson.version
  if (!version) {
    throw new Error('Could not resolve Electron version from root node_modules')
  }
  return version
}

function isSameFile(left, right) {
  return resolve(left) === resolve(right)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.ci ? { ...process.env, CI: 'true' } : process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}
