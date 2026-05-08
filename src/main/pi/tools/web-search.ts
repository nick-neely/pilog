import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { SearchProvider } from '@shared/types'

const MAX_SEARCH_RESULTS = 10

const WebSearchParameters = Type.Object({
  query: Type.String({ minLength: 1 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: MAX_SEARCH_RESULTS }))
})
type WebSearchParameters = Static<typeof WebSearchParameters>

export type WebSearchResult = {
  url: string
  title: string
  snippet: string
}

export type WebSearchConfig = {
  provider: SearchProvider
  apiKey: string
  fetchImpl?: typeof fetch
}

export function createWebSearchTool(
  config: WebSearchConfig
): AgentTool<typeof WebSearchParameters> {
  return {
    name: 'web_search',
    label: 'Web Search',
    description:
      'Search the web through the configured provider and return bounded URL, title, and snippet results.',
    parameters: WebSearchParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input, signal) => {
      const results = await searchWeb(
        {
          provider: config.provider,
          apiKey: config.apiKey,
          fetchImpl: config.fetchImpl
        },
        input.query,
        input.limit ?? 5,
        signal
      )

      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        details: results
      }
    }
  }
}

export async function searchWeb(
  config: WebSearchConfig,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<WebSearchResult[]> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_RESULTS)
  return config.provider === 'tavily'
    ? searchTavily(config, query, boundedLimit, signal)
    : searchBrave(config, query, boundedLimit, signal)
}

async function searchBrave(
  config: WebSearchConfig,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<WebSearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(limit))

  const response = await getFetch(config)(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': config.apiKey
    },
    signal
  })
  const body = await readJson(response)
  const results = getRecordArray(getRecord(body).web, 'results')

  return results.slice(0, limit).map((result) => ({
    url: getString(result.url),
    title: getString(result.title),
    snippet: getString(result.description)
  }))
}

async function searchTavily(
  config: WebSearchConfig,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<WebSearchResult[]> {
  const response = await getFetch(config)('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      max_results: limit,
      include_answer: false,
      include_raw_content: false
    }),
    signal
  })
  const body = await readJson(response)
  const results = getRecordArray(body, 'results')

  return results.slice(0, limit).map((result) => ({
    url: getString(result.url),
    title: getString(result.title),
    snippet: getString(result.content)
  }))
}

function getFetch(config: WebSearchConfig): typeof fetch {
  return config.fetchImpl ?? fetch
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Search provider request failed with status ${response.status}.`)
  }

  return response.json()
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function getRecordArray(value: unknown, key: string): Array<Record<string, unknown>> {
  const record = getRecord(value)
  return Array.isArray(record[key]) ? record[key].filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
