import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface WorkflowExpectation {
  path: string
  channel: 'stable' | 'preview'
  publishLabel: string
  publishFlag: string
  uploadArtifactName: string
  updaterMetadata: string[]
  releaseCreateFlag: string
}

const workflows: WorkflowExpectation[] = [
  {
    path: '.github/workflows/release-stable.yml',
    channel: 'stable',
    publishLabel: 'Publish macOS artifacts',
    publishFlag: '--publish never',
    uploadArtifactName: 'packaged-size-reports-stable-mac',
    updaterMetadata: ['dist/latest-mac.yml', 'dist/latest.yml', 'dist/latest-linux.yml'],
    releaseCreateFlag: '--generate-notes'
  },
  {
    path: '.github/workflows/release-preview.yml',
    channel: 'preview',
    publishLabel: 'Publish macOS preview artifacts',
    publishFlag: '--config electron-builder.preview.yml --publish never',
    uploadArtifactName: 'packaged-size-reports-preview-mac',
    updaterMetadata: ['dist/preview-mac.yml', 'dist/preview.yml', 'dist/preview-linux.yml'],
    releaseCreateFlag: '--prerelease --generate-notes'
  }
]

describe('release workflow size reports', () => {
  it.each(workflows)(
    '$channel workflow generates inspectable reports after packaging and before publishing',
    async ({
      path,
      channel,
      publishLabel,
      publishFlag,
      uploadArtifactName,
      updaterMetadata,
      releaseCreateFlag
    }) => {
      const workflow = await readFile(path, 'utf8')

      expect(workflow).toContain(`pnpm exec electron-builder --mac ${publishFlag}`)
      expect(workflow).toContain(`pnpm exec electron-builder --win ${publishFlag}`)
      expect(workflow).toContain(`pnpm exec electron-builder --linux ${publishFlag}`)
      expect(workflow).toContain('pnpm inventory:packaged')
      expect(workflow).toContain('pnpm budget:packaged')
      expect(workflow).toContain('actions/upload-artifact@v4')
      expect(workflow).toContain(uploadArtifactName)
      expect(workflow).toContain(
        `gh release create "$TAG" --verify-tag --title "$TAG" ${releaseCreateFlag}`
      )
      for (const metadataFile of updaterMetadata) {
        expect(workflow).toContain(metadataFile)
      }
      for (const platform of ['mac', 'win', 'linux']) {
        expect(workflow).toContain(`dist/reports/${channel}-${platform}`)
        expect(workflow).toContain(`packaged-size-reports-${channel}-${platform}`)
      }

      const packageIndex = workflow.indexOf(`--mac ${publishFlag}`)
      const reportIndex = workflow.indexOf(`dist/reports/${channel}-mac`)
      const uploadIndex = workflow.indexOf(`name: ${uploadArtifactName}`)
      const publishIndex = workflow.indexOf(`name: ${publishLabel}`)

      expect(packageIndex).toBeGreaterThan(-1)
      expect(reportIndex).toBeGreaterThan(packageIndex)
      expect(uploadIndex).toBeGreaterThan(reportIndex)
      expect(publishIndex).toBeGreaterThan(uploadIndex)
    }
  )
})
