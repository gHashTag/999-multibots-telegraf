import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join as pathJoin } from 'path'

import { resolveIsOwnProfile } from './useIsOwnProfile'

describe('profile ownership', () => {
  it('trusts the server-owned profile proof before client atoms hydrate', () => {
    expect(
      resolveIsOwnProfile({
        profile: {
          telegram_id: '27',
          is_own_profile: true,
        },
        myProfileTelegramId: null,
        userTelegramId: null,
        hasDevOwnerKey: false,
      })
    ).toBe(true)
  })

  it('does not expose owner navigation without any matching proof', () => {
    expect(
      resolveIsOwnProfile({
        profile: {
          telegram_id: '27',
          is_own_profile: false,
        },
        myProfileTelegramId: null,
        userTelegramId: null,
        hasDevOwnerKey: false,
      })
    ).toBe(false)
  })
})

describe('свой профиль в сборке разработчика', () => {
  it('ход существует и закрыт проверкой сборки', () => {
    /*
     * Разделы «своего» профиля видит только узнанный, а узнают по подписи
     * Telegram. У проверяющего её нет — код авторизации это учётные данные
     * владельца. Значит «Ждут одобрения» нельзя было увидеть глазами ни разу.
     *
     * `import.meta.env.DEV` в рабочей сборке равен `false`, и Vite вырезает
     * ветку: в собранных файлах её нет. Убери проверку — и любой посетитель
     * открывал бы чужой профиль как свой.
     */
    const исходник = readFileSync(
      pathJoin(__dirname, 'useIsOwnProfile.ts'),
      'utf8'
    )
    expect(исходник).toContain("new URLSearchParams(location.search).has('свой')")
    expect(исходник).toMatch(/if \(!import\.meta\.env\.DEV\) return false/)
  })
})
