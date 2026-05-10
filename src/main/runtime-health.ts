import { app } from 'electron'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import type { RuntimeHealthCheck } from '@shared/ipc'
import { PILOG_APP_ID, PILOG_PRODUCT_NAME } from '@shared/app-identity'
import { loadBetterSqlite3 } from './db/load-better-sqlite3'
import { resolveRgPath } from './pi/tools/repo-tools'

export async function getRuntimeHealthCheck(iconPath: string): Promise<RuntimeHealthCheck> {
  const sqlite = checkSqlite()
  const [piAgentCore, piAi] = await Promise.all([checkPiAgentCoreImport(), checkPiAiImport()])
  const ripgrepPath = resolveRgPath()
  const productName = app.getName()

  return {
    appId: PILOG_APP_ID,
    expectedProductName: PILOG_PRODUCT_NAME,
    productName,
    packaged: app.isPackaged,
    defaultApp: process.defaultApp === true,
    resourcesPath: process.resourcesPath,
    iconPath,
    iconExists: existsSync(iconPath),
    iconFilename: basename(iconPath),
    sqlite,
    piAgentCore,
    piAi,
    ripgrep: {
      ok: existsSync(ripgrepPath),
      path: ripgrepPath,
      fromAsarUnpacked: ripgrepPath.includes('app.asar.unpacked')
    },
    boilerplateFree: {
      appId: !getBoilerplateAppIds().includes(PILOG_APP_ID),
      productName: productName === PILOG_PRODUCT_NAME
    }
  }
}

function getBoilerplateAppIds(): string[] {
  return ['com.' + 'electron', 'com.' + 'electron' + '.app']
}

function checkSqlite(): RuntimeHealthCheck['sqlite'] {
  try {
    const Database = loadBetterSqlite3()
    const db = new Database(':memory:')
    const result = db.prepare('select 1 as ok').get() as { ok?: number }
    db.close()
    return { ok: result.ok === 1 }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function checkPiAgentCoreImport(): Promise<{ ok: boolean; error?: string }> {
  try {
    await import('@earendil-works/pi-agent-core')
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function checkPiAiImport(): Promise<{ ok: boolean; error?: string }> {
  try {
    await import('@earendil-works/pi-ai')
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
