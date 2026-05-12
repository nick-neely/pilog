import { readFileSync } from 'node:fs'

const expectedVersion = process.argv[2]

if (!expectedVersion) {
  console.error('Usage: node scripts/validate-release-version.mjs <version>')
  process.exit(1)
}

const packagePaths = ['package.json', 'app/package.json']
let failed = false

for (const packagePath of packagePaths) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (pkg.version !== expectedVersion) {
    console.error(
      `${packagePath} version ${pkg.version} does not match release version ${expectedVersion}`
    )
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log(`Release package versions match ${expectedVersion}`)
