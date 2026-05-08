import simpleGit from 'simple-git'

export type LocalGitMetadata = {
  remoteUrl: string
  defaultBranch: string
  headSha: string
}

export async function isGitRepo(localPath: string): Promise<boolean> {
  return simpleGit(localPath)
    .checkIsRepo()
    .catch(() => false)
}

export async function readLocalGitMetadata(localPath: string): Promise<LocalGitMetadata | null> {
  const git = simpleGit(localPath)

  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) return null

  const remotes = await git.getRemotes(true)
  const origin = remotes.find((r) => r.name === 'origin')
  if (!origin?.refs.fetch) return null

  const headSha = await git.revparse(['HEAD']).catch(() => null)
  if (!headSha) return null

  let defaultBranch: string
  try {
    const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
    defaultBranch = branch.trim()
  } catch {
    defaultBranch = 'main'
  }

  return {
    remoteUrl: origin.refs.fetch,
    defaultBranch,
    headSha: headSha.trim()
  }
}

export function parseGitHubOwnerRepo(remoteUrl: string): { owner: string; name: string } | null {
  // HTTPS: https://github.com/owner/repo.git  or  https://github.com/owner/repo
  // SSH:   git@github.com:owner/repo.git      or  git@github.com:owner/repo
  const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (!match) return null
  return { owner: match[1], name: match[2] }
}
