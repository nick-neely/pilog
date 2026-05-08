import { describe, expect, it, vi } from 'vitest'
import { createWebSearchTool, searchWeb } from './web-search'

describe('web_search tool', () => {
  it('returns structured Brave results from a provider response', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        web: {
          results: [
            {
              url: 'https://example.com/a',
              title: 'Example A',
              description: 'A result snippet.'
            }
          ]
        }
      })
    ) as typeof fetch

    await expect(
      searchWeb({ provider: 'brave', apiKey: 'brave-key', fetchImpl }, 'pilog settings', 3)
    ).resolves.toEqual([
      {
        url: 'https://example.com/a',
        title: 'Example A',
        snippet: 'A result snippet.'
      }
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('api.search.brave.com') }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Subscription-Token': 'brave-key' })
      })
    )
  })

  it('returns structured Tavily results from a provider response', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          {
            url: 'https://example.com/b',
            title: 'Example B',
            content: 'B result snippet.'
          }
        ]
      })
    ) as typeof fetch

    await expect(
      searchWeb({ provider: 'tavily', apiKey: 'tvly-key', fetchImpl }, 'pilog settings', 2)
    ).resolves.toEqual([
      {
        url: 'https://example.com/b',
        title: 'Example B',
        snippet: 'B result snippet.'
      }
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tvly-key' })
      })
    )
  })

  it('exposes only the bounded web_search tool contract', async () => {
    const tool = createWebSearchTool({
      provider: 'brave',
      apiKey: 'brave-key',
      fetchImpl: vi.fn(async () => Response.json({ web: { results: [] } })) as typeof fetch
    })

    expect(tool.name).toBe('web_search')
    expect(tool.name).not.toBe('web_fetch')
    await expect(tool.execute('tool', { query: 'pilog', limit: 50 })).resolves.toMatchObject({
      details: []
    })
  })
})
