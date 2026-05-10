export type RepoLabelLike = {
  name: string
}

export type LabelMatch =
  | {
      input: string
      name: string
      matched: true
    }
  | {
      input: string
      name: string
      matched: false
    }

export function normalizeLabelKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function matchLabelsToRepoLabels(
  labels: readonly string[],
  repoLabels: readonly RepoLabelLike[]
): LabelMatch[] {
  const exact = new Map<string, string>()
  const normalized = new Map<string, string>()

  for (const repoLabel of repoLabels) {
    const name = repoLabel.name.trim()
    if (!name) continue
    exact.set(name.toLowerCase(), name)
    const key = normalizeLabelKey(name)
    if (key && !normalized.has(key)) normalized.set(key, name)
  }

  const seen = new Set<string>()
  const matches: LabelMatch[] = []

  for (const rawLabel of labels) {
    const input = rawLabel.trim()
    if (!input) continue

    const exactMatch = exact.get(input.toLowerCase())
    const normalizedMatch = exactMatch ?? normalized.get(normalizeLabelKey(input))
    const name = normalizedMatch ?? input
    const dedupeKey = normalizedMatch ? `matched:${name.toLowerCase()}` : `unmatched:${input}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    matches.push(
      normalizedMatch ? { input, name, matched: true } : { input, name: input, matched: false }
    )
  }

  return matches
}

export function normalizeLabelsToRepoLabels(
  labels: readonly string[],
  repoLabels: readonly RepoLabelLike[]
): string[] {
  return matchLabelsToRepoLabels(labels, repoLabels).map((match) => match.name)
}

export function filterLabelsForPublish(input: {
  labels: readonly string[]
  repoLabels: readonly RepoLabelLike[]
  keptUnmatchedLabels?: readonly string[]
}): string[] {
  const kept = new Set((input.keptUnmatchedLabels ?? []).map((label) => label.trim()))

  return matchLabelsToRepoLabels(input.labels, input.repoLabels)
    .filter((match) => match.matched || kept.has(match.name))
    .map((match) => match.name)
}
