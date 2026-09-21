/**
 * THE PRODUCTION BUNDLE GETS PAST ITS OWN IMPORTS.
 *
 * 2026-09-22: a static import of businessBotService at the top of src/index.ts
 * closed a cycle in the bundle's init order --
 *
 *   businessBotService > aiChatService > chatMemoryService > core/supabase
 *   > interfaces > price/helpers > navigation > scenes > aiChatWizard
 *   > aiChatService (still initialising)
 *
 * -- and aiChatWizard read AI_CHAT_MODELS before it existed. Every start died
 * with "Cannot convert undefined or null to object"; Railway failed the
 * healthcheck 11 times and kept the old build. Every unit test was green,
 * because no unit test loads the bundle in the order production does.
 *
 * So this builds the bundle exactly as the Dockerfile does (esbuild, cjs,
 * packages external) and runs it with an EMPTY environment: no tokens, no
 * Supabase, no Infisical -- nothing to connect to. The imports run first and
 * synchronously; if they get through, the process reaches startApplication
 * and stops there for want of credentials, which is all this asks.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
/*
 * Printed by startApplication, i.e. AFTER every import has run: with no
 * Infisical credentials the app refuses to start, and says so. An earlier
 * line would not do -- "Bot tokens check in ENV" comes from the config module
 * and was printed before the crash, which made the first version of this test
 * pass against the very bundle it was written for.
 */
const REACHED = 'Infisical credentials missing'

describe('the production bundle', () => {
  it('gets past its imports with nothing configured', async () => {
    /*
     * Inside node_modules/.cache, so the bundle's external packages resolve
     * from this repository the way they do from /app in the image.
     */
    const cache = path.join(ROOT, 'node_modules/.cache')
    mkdirSync(cache, { recursive: true })
    const dir = mkdtempSync(path.join(cache, 'bundle-boot-'))
    const out = path.join(dir, 'index.js')
    try {
      execFileSync(
        path.join(ROOT, 'node_modules/.bin/esbuild'),
        [
          'src/index.ts',
          '--bundle',
          '--platform=node',
          '--target=node20',
          '--format=cjs',
          `--outfile=${out}`,
          '--packages=external',
          '--log-level=error',
        ],
        { cwd: ROOT, stdio: 'pipe' }
      )

      const output = await new Promise<string>(resolve => {
        let text = ''
        const child = spawn(process.execPath, [out], {
          cwd: dir,
          /* No .env in cwd, no secrets: nothing to connect to. */
          env: {
            PATH: process.env.PATH ?? '',
            HOME: dir,
            NODE_ENV: 'production',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        const done = () => {
          child.kill('SIGKILL')
          resolve(text)
        }
        const take = (b: Buffer) => {
          text += b.toString()
        }
        child.stdout.on('data', take)
        child.stderr.on('data', take)
        child.on('exit', () => resolve(text))
        setTimeout(done, 30_000)
      })

      expect(output).not.toMatch(/Cannot convert undefined or null to object/)
      expect(output).not.toMatch(/TypeError|ReferenceError/)
      expect(output).toContain(REACHED)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 90_000)
})
