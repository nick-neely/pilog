export interface ReleaseArtifact {
  fileName: string
  downloadUrl: string
  label?: string
  fileSize?: number
  sha256?: string
}

const VALID_PLATFORMS = ['macos', 'windows', 'linux'] as const
type Platform = (typeof VALID_PLATFORMS)[number]

export interface PlatformRelease {
  platform: Platform
  label: string
  description: string
  artifacts: ReleaseArtifact[]
}

export interface ReleaseChannel {
  version: string
  releaseUrl: string
  publishedAt?: string
  platforms: PlatformRelease[]
}

export interface ReleaseManifest {
  schemaVersion: number
  stable: ReleaseChannel | null
  preview: ReleaseChannel | null
}

export interface ManifestValidationError {
  path: string
  message: string
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function validateArtifact(value: unknown, path: string): ManifestValidationError[] {
  if (!isObject(value)) return [{ path, message: 'must be an object' }]
  const errors: ManifestValidationError[] = []
  if (!isString(value.fileName) || value.fileName.length === 0)
    errors.push({ path: `${path}.fileName`, message: 'must be a non-empty string' })
  if (!isString(value.downloadUrl) || value.downloadUrl.length === 0)
    errors.push({ path: `${path}.downloadUrl`, message: 'must be a non-empty string' })
  if (value.label !== undefined && !isString(value.label))
    errors.push({ path: `${path}.label`, message: 'must be a string if present' })
  if (value.fileSize !== undefined && typeof value.fileSize !== 'number')
    errors.push({ path: `${path}.fileSize`, message: 'must be a number if present' })
  if (value.sha256 !== undefined && !isString(value.sha256))
    errors.push({ path: `${path}.sha256`, message: 'must be a string if present' })
  return errors
}

function validatePlatform(value: unknown, path: string): ManifestValidationError[] {
  if (!isObject(value)) return [{ path, message: 'must be an object' }]
  const errors: ManifestValidationError[] = []
  if (!isString(value.platform) || !(VALID_PLATFORMS as readonly string[]).includes(value.platform))
    errors.push({ path: `${path}.platform`, message: 'must be macos, windows, or linux' })
  if (!isString(value.label) || value.label.length === 0)
    errors.push({ path: `${path}.label`, message: 'must be a non-empty string' })
  if (!isString(value.description))
    errors.push({ path: `${path}.description`, message: 'must be a string' })
  if (!isArray(value.artifacts))
    errors.push({ path: `${path}.artifacts`, message: 'must be an array' })
  else {
    value.artifacts.forEach((a, i) =>
      errors.push(...validateArtifact(a, `${path}.artifacts[${i}]`))
    )
  }
  return errors
}

function validateChannel(value: unknown, path: string): ManifestValidationError[] {
  if (!isObject(value)) return [{ path, message: 'must be an object' }]
  const errors: ManifestValidationError[] = []
  if (!isString(value.version) || value.version.length === 0)
    errors.push({ path: `${path}.version`, message: 'must be a non-empty string' })
  if (!isString(value.releaseUrl) || value.releaseUrl.length === 0)
    errors.push({ path: `${path}.releaseUrl`, message: 'must be a non-empty string' })
  if (value.publishedAt !== undefined && !isString(value.publishedAt))
    errors.push({ path: `${path}.publishedAt`, message: 'must be a string if present' })
  if (!isArray(value.platforms))
    errors.push({ path: `${path}.platforms`, message: 'must be an array' })
  else {
    value.platforms.forEach((p, i) =>
      errors.push(...validatePlatform(p, `${path}.platforms[${i}]`))
    )
  }
  return errors
}

export function validateReleaseManifest(value: unknown): ManifestValidationError[] {
  if (!isObject(value)) return [{ path: '', message: 'manifest must be an object' }]
  const errors: ManifestValidationError[] = []
  if (typeof value.schemaVersion !== 'number' || value.schemaVersion < 1)
    errors.push({ path: 'schemaVersion', message: 'must be a positive number' })
  if (!('stable' in value))
    errors.push({ path: 'stable', message: 'field is required (use null for no stable release)' })
  else if (value.stable !== null) errors.push(...validateChannel(value.stable, 'stable'))
  if (!('preview' in value))
    errors.push({ path: 'preview', message: 'field is required (use null for no preview release)' })
  else if (value.preview !== null) errors.push(...validateChannel(value.preview, 'preview'))
  return errors
}

export function isValidReleaseManifest(value: unknown): value is ReleaseManifest {
  return validateReleaseManifest(value).length === 0
}
