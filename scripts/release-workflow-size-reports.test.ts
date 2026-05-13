import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface WorkflowExpectation {
  path: string
  channel: 'stable' | 'preview'
  publishLabel: string
  packageArgs: string
  updaterMetadata: string[]
  releaseCreateFlag: string
}

interface PlatformExpectation {
  packageTarget: '--mac' | '--win' | '--linux'
  platform: 'mac' | 'win' | 'linux'
}

const platforms: readonly PlatformExpectation[] = [
  {
    packageTarget: '--mac',
    platform: 'mac'
  },
  {
    packageTarget: '--win',
    platform: 'win'
  },
  {
    packageTarget: '--linux',
    platform: 'linux'
  }
]

const workflows: readonly WorkflowExpectation[] = [
  {
    path: '.github/workflows/release-stable.yml',
    channel: 'stable',
    publishLabel: 'Publish macOS artifacts',
    packageArgs: '--publish never',
    updaterMetadata: ['dist/latest-mac.yml', 'dist/latest.yml', 'dist/latest-linux.yml'],
    releaseCreateFlag: '--generate-notes'
  },
  {
    path: '.github/workflows/release-preview.yml',
    channel: 'preview',
    publishLabel: 'Publish macOS preview artifacts',
    packageArgs: '--config electron-builder.preview.yml --publish never',
    updaterMetadata: ['dist/preview-mac.yml', 'dist/preview.yml', 'dist/preview-linux.yml'],
    releaseCreateFlag: '--prerelease --generate-notes'
  }
]

describe('release workflow size reports', () => {
  it.each(workflows)(
    '$channel workflow generates inspectable reports after packaging and before publishing',
    async ({ path, channel, publishLabel, packageArgs, updaterMetadata, releaseCreateFlag }) => {
      const workflow = await readFile(path, 'utf8')
      const macReportDirectory = `dist/reports/${channel}-mac`
      const macReportArtifactName = `packaged-size-reports-${channel}-mac`

      for (const { packageTarget, platform } of platforms) {
        expect(workflow).toContain(`pnpm exec electron-builder ${packageTarget} ${packageArgs}`)
        expect(workflow).toContain(`REPORT_DIR=dist/reports/${channel}-${platform}`)
        expect(workflow).toContain(`name: packaged-size-reports-${channel}-${platform}`)
      }
      expect(workflow).toContain('pnpm inventory:packaged')
      expect(workflow).toContain('pnpm budget:packaged')
      expect(workflow).toContain('actions/upload-artifact@v4')
      expect(workflow).toContain(
        `gh release create "$TAG" --verify-tag --title "$TAG" ${releaseCreateFlag}`
      )
      for (const metadataFile of updaterMetadata) {
        expect(workflow).toContain(metadataFile)
      }

      const packageIndex = workflow.indexOf(`--mac ${packageArgs}`)
      const reportIndex = workflow.indexOf(`REPORT_DIR=${macReportDirectory}`)
      const uploadIndex = workflow.indexOf(`name: ${macReportArtifactName}`)
      const publishIndex = workflow.indexOf(`name: ${publishLabel}`)

      expect(packageIndex).toBeGreaterThan(-1)
      expect(reportIndex).toBeGreaterThan(packageIndex)
      expect(uploadIndex).toBeGreaterThan(reportIndex)
      expect(publishIndex).toBeGreaterThan(uploadIndex)
    }
  )
})
