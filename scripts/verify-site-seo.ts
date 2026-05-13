import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'

const SITE_ORIGIN = 'https://pilog.dev'
const PUBLIC_ROUTES = ['/', '/download', '/docs', '/about'] as const
const STRUCTURED_DATA_ROUTES = PUBLIC_ROUTES
const PREVIEW_ROUTE = '/preview'
const REQUIRED_SOCIAL_META_KEYS = [
  'og:title',
  'og:description',
  'og:url',
  'og:site_name',
  'og:type',
  'og:image',
  'twitter:card',
  'twitter:title',
  'twitter:description',
  'twitter:image'
] as const

type MetaMap = Map<string, string>

type RouteHtml = {
  readonly path: string
  readonly html: string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function run(command: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'no exit code'}`))
    })
  })
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      assert(address !== null && typeof address === 'object', 'Could not allocate a local port')
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })
}

async function waitForServer(
  baseUrl: string,
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  const deadline = Date.now() + 30_000
  let lastError: unknown

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next server exited before SEO checks could run with code ${child.exitCode}`)
    }

    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
      lastError = new Error(`Server returned ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${baseUrl}: ${String(lastError)}`)
}

async function withNextServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn('node', ['.next/standalone/site/server.js'], {
    cwd: 'site',
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(port)
    },
    shell: process.platform === 'win32'
  })

  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))

  try {
    await waitForServer(baseUrl, child)
    return await callback(baseUrl)
  } finally {
    child.kill()
  }
}

async function fetchText(baseUrl: string, path: string): Promise<string> {
  const response = await fetch(new URL(path, baseUrl))
  assert(response.ok, `${path} returned ${response.status}`)
  return await response.text()
}

function contentAttribute(tag: string): string | undefined {
  return tag.match(/\scontent="([^"]*)"/)?.[1]
}

function parseMetadata(html: string): { title: string; canonical: string; meta: MetaMap } {
  const meta: MetaMap = new Map()
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? ''
  const canonical =
    html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"[^>]*>/)?.[1] ??
    html.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"[^>]*>/)?.[1] ??
    ''

  for (const tag of html.matchAll(/<meta\s+[^>]*>/g)) {
    const raw = tag[0]
    const key = raw.match(/\s(?:name|property)="([^"]+)"/)?.[1]
    const content = contentAttribute(raw)

    if (key && content !== undefined) {
      meta.set(key, content)
    }
  }

  return { title, canonical, meta }
}

function parseStructuredData(html: string): readonly unknown[] {
  return Array.from(
    html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  ).map(([, rawJson]) => JSON.parse(rawJson))
}

function expectedCanonical(path: string): string {
  return path === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`
}

function expectedSitemapUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString()
}

function assertPublicRouteSeo({ path, html }: RouteHtml): void {
  const { title, canonical, meta } = parseMetadata(html)
  const expectedUrl = expectedCanonical(path)

  assert(title.trim().length > 0, `${path} is missing a non-empty title`)
  assert(meta.get('description')?.trim(), `${path} is missing a non-empty description`)
  assert(canonical === expectedUrl, `${path} canonical should be ${expectedUrl}`)

  for (const key of REQUIRED_SOCIAL_META_KEYS) {
    assert(meta.get(key)?.trim(), `${path} is missing ${key}`)
  }

  assert(meta.get('og:url') === expectedUrl, `${path} Open Graph URL does not match canonical`)
}

function assertStructuredData({ path, html }: RouteHtml): void {
  const scripts = parseStructuredData(html)

  assert(scripts.length > 0, `${path} is missing JSON-LD structured data`)

  for (const script of scripts) {
    assert(isRecord(script), `${path} JSON-LD is not an object`)
    assert(
      script['@context'] === 'https://schema.org',
      `${path} JSON-LD is missing schema.org context`
    )
  }
}

function assertPreviewNoindex(html: string): void {
  const { canonical, meta } = parseMetadata(html)
  const robots = meta.get('robots') ?? ''

  assert(
    canonical === `${SITE_ORIGIN}${PREVIEW_ROUTE}`,
    'Preview canonical should point at /preview'
  )
  assert(robots.includes('noindex'), 'Preview Download should remain noindex')
  assert(robots.includes('nofollow'), 'Preview Download should remain nofollow')
}

function assertRobots(robots: string): void {
  assert(robots.includes('User-Agent: *'), 'robots.txt should include the global user agent')
  assert(robots.includes('Allow: /'), 'robots.txt should allow the public site')
  assert(
    robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`),
    'robots.txt should point to the production sitemap'
  )
  assert(robots.includes(`Host: ${SITE_ORIGIN}`), 'robots.txt should include the production host')
}

function assertSitemap(sitemap: string): void {
  for (const path of PUBLIC_ROUTES) {
    assert(
      sitemap.includes(`<loc>${expectedSitemapUrl(path)}</loc>`),
      `sitemap.xml should include ${expectedSitemapUrl(path)}`
    )
  }

  assert(
    !sitemap.includes(`${SITE_ORIGIN}${PREVIEW_ROUTE}`),
    'sitemap.xml should not include Preview Download'
  )
}

async function main(): Promise<void> {
  await run('pnpm', ['run', 'site:build'], process.cwd())

  await withNextServer(async (baseUrl) => {
    const publicPages = await Promise.all(
      PUBLIC_ROUTES.map(async (path) => ({ path, html: await fetchText(baseUrl, path) }))
    )
    const publicPagesByPath = new Map(publicPages.map((page) => [page.path, page]))

    for (const page of publicPages) {
      assertPublicRouteSeo(page)
    }

    for (const path of STRUCTURED_DATA_ROUTES) {
      const page = publicPagesByPath.get(path)
      assert(page, `Missing fetched page for ${path}`)
      assertStructuredData(page)
    }

    assertPreviewNoindex(await fetchText(baseUrl, PREVIEW_ROUTE))
    assertRobots(await fetchText(baseUrl, '/robots.txt'))
    assertSitemap(await fetchText(baseUrl, '/sitemap.xml'))
  })

  console.log('Site SEO regression checks passed.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
