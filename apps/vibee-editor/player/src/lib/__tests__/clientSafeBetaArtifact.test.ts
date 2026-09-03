// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8')

const safeBetaSource = read('../../config/safeBeta.ts')
const profileSource = read('../../atoms/profile.ts')
const userSource = read('../../atoms/user.ts')
const botAssetsSource = read('../../atoms/botAssets.ts')
const avatarPhotosSource = read('../../atoms/avatarPhotos.ts')
const soulSource = read('../../atoms/soul.ts')
const feedSource = read('../../atoms/feed.ts')
const appSource = read('../../App.tsx')
const tabBarSource = read('../../components/Navigation/TelegramTabBar.tsx')
const headerSource = read('../../components/Header/Header.tsx')
const telegramProviderSource = read(
  '../../components/Telegram/TelegramProvider.tsx'
)
const paywallSource = read('../../components/Auth/PaywallModal.tsx')
const viteSource = read('../../../vite.config.ts')

describe('SAFE BETA client artifact', () => {
  it('uses a literal capability lock with no environment escape hatch', () => {
    expect(safeBetaSource).toContain('SAFE_BETA_CLIENT_LOCKED = true')
    expect(safeBetaSource).not.toMatch(/import\.meta\.env|process\.env/)
  })

  it('never sends client ownership ids from profile/user/feed actions', () => {
    expect(profileSource).not.toContain('fetch(')
    expect(profileSource).not.toMatch(/[?&](?:telegram_id|user_id)=/)
    expect(profileSource).not.toMatch(/telegram_id:\s*user\.id/)

    expect(userSource).not.toContain('fetch(')
    expect(userSource).not.toMatch(/[?&](?:telegram_id|user_id)=/)
    expect(userSource).not.toMatch(/telegram_id:\s*user\.id/)

    expect(botAssetsSource).not.toContain('fetch(')
    expect(botAssetsSource).not.toContain('/api/assets/')
    expect(botAssetsSource).not.toMatch(
      /getTelegramUser|userAtom|resolveTelegramId/
    )

    expect(avatarPhotosSource).not.toContain('fetch(')
    expect(avatarPhotosSource).not.toContain('/api/assets')
    expect(avatarPhotosSource).not.toMatch(
      /getTelegramUser|userAtom|resolveTelegramId/
    )

    expect(soulSource).not.toContain('fetch(')
    expect(soulSource).not.toContain("method: 'tools/call'")

    expect(feedSource).not.toMatch(/[?&](?:telegram_id|user_id)=/)
    expect(feedSource).not.toMatch(/['"]X-Telegram-Id['"]/)
    expect(feedSource).not.toMatch(
      /JSON\.stringify\(\{[^}]*\b(?:telegram_id|user_id)\b/s
    )
  })

  it('removes paid/generation routes and navigation while preserving read/draft paths', () => {
    expect(appSource).not.toContain("import('@/pages/Generate')")
    expect(appSource).not.toContain("import('@/pages/Script')")
    expect(appSource).toContain('path="/generate/*"')
    expect(appSource).toContain('path="/editor"')
    expect(appSource).toContain('path="/chat"')
    expect(tabBarSource).not.toContain("route: '/generate")
    expect(headerSource).not.toContain("route: '/generate")
    expect(telegramProviderSource).not.toContain("'/generate/")
  })

  it('contains no client Stars or publish dispatch', () => {
    expect(feedSource).not.toContain('openInvoice')
    expect(feedSource).not.toContain('/api/feed/publish')
    expect(feedSource).not.toContain('/star')
    expect(paywallSource).not.toMatch(/window\.open|subscribe_|PAYMENT_METHODS/)
    expect(paywallSource).toContain('Payments are unavailable in SAFE BETA')
  })

  it('blocks the legacy local paid proxy without reading secrets or contacting a provider', () => {
    expect(viteSource).toContain("name: 'safe-beta-replicate-lock'")
    expect(viteSource).toContain("server.middlewares.use('/api/replicate'")
    expect(viteSource).not.toMatch(
      /REPLICATE_API_TOKEN|api\.replicate\.com|await fetch\(/
    )
  })
})
