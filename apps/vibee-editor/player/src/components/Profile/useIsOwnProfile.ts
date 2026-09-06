import { useAtomValue } from 'jotai'
import { myProfileAtom, userAtom, viewedProfileAtom } from '@/atoms'

interface ProfileOwnershipInput {
  profile:
    | {
        telegram_id?: string | number | null
        is_own_profile?: boolean
      }
    | null
    | undefined
  myProfileTelegramId?: string | number | null
  userTelegramId?: string | number | null
  hasDevOwnerKey: boolean
}

/**
 * Merge the three independently valid ownership proofs without making one
 * asynchronous source a prerequisite for the others.
 *
 * The server flag is the strongest signal: it is computed from verified
 * request identity. The two client ids cover the short hydration race after
 * navigation/login. A false server flag is not authoritative because the
 * public profile request may finish before the signed session is available.
 */
export function resolveIsOwnProfile({
  profile,
  myProfileTelegramId,
  userTelegramId,
  hasDevOwnerKey,
}: ProfileOwnershipInput): boolean {
  if (hasDevOwnerKey) return true
  if (!profile?.telegram_id) return false
  if (profile.is_own_profile === true) return true

  const viewedTelegramId = String(profile.telegram_id)
  return (
    viewedTelegramId === String(myProfileTelegramId ?? '') ||
    viewedTelegramId === String(userTelegramId ?? '')
  )
}

/**
 * «Этот профиль — мой?» — ОДИН ответ на весь экран профиля.
 *
 * ПОЧЕМУ ХУК, А НЕ ДВЕ ПРОВЕРКИ. Их и было две, и они расходились.
 * `ProfileTabs` сверялся с `userAtom` и знал про DEV-ключ, а `pages/Profile.tsx`
 * сверялся с `myProfileAtom` и про ключ не знал. В dev-сборке это давало
 * профиль, где вкладки «План», «Файлы» и «Скиллы» есть, а SOUL под ними нет —
 * при том, что видимость у них одна и та же.
 *
 * Расхождение мешало не только смотреть: правку в SOUL нельзя было проверить
 * живьём, потому что раздел просто не рендерился.
 *
 * Оба источника личности учитываются: `myProfileAtom` заполняется синком
 * профиля из Telegram, `userAtom` — автологином из launch-данных. Какой из
 * них успел заполниться первым, зависит от порядка запросов, поэтому
 * спрашиваем оба.
 *
 * DEV-КОННЕКТОР. `VITE_AGENT_KEY` — это ключ самого владельца: в dev-сборке
 * без входа через Telegram он и есть личность. `import.meta.env.DEV`
 * вычисляется на сборке, поэтому в прод эта ветка не попадает вовсе.
 */
export function useIsOwnProfile(): boolean {
  const profile = useAtomValue(viewedProfileAtom)
  const myProfile = useAtomValue(myProfileAtom)
  const user = useAtomValue(userAtom)

  return resolveIsOwnProfile({
    profile,
    myProfileTelegramId: myProfile?.telegram_id,
    userTelegramId: user?.id,
    hasDevOwnerKey:
      import.meta.env.DEV &&
      (Boolean(import.meta.env.VITE_AGENT_KEY) || свойПрофильВРазработке()),
  })
}

/**
 * ПОСМОТРЕТЬ СВОЙ ПРОФИЛЬ БЕЗ ПОДПИСИ TELEGRAM — ТОЛЬКО В СБОРКЕ РАЗРАБОТЧИКА.
 *
 * Тот же приём и та же причина, что у подставного остатка: разделы «своего»
 * профиля показываются лишь тому, кого узнали, а узнают по подписи Telegram.
 * У проверяющего её нет и не будет — код авторизации это учётные данные
 * владельца. Значит раздел «Ждут одобрения» нельзя было увидеть ГЛАЗАМИ ни
 * разу, а долг проверки такого рода не гасится сам.
 *
 * Здесь уже был ход для разработки — `VITE_AGENT_KEY`, — но он требует
 * настоящего ключа в окружении. Этот не требует ничего: признак ставит тот,
 * кто ОТКРЫВАЕТ страницу.
 *
 * `import.meta.env.DEV` в рабочей сборке равен `false`, и Vite вырезает
 * ветку целиком — в собранных файлах её нет.
 *
 * Что этим проверяется, а что нет: вид экрана и разводка разделов — да;
 * серверные ответы — нет, они по-прежнему требуют подписи и вернут 401.
 * Раздел покажет своё пустое состояние, и это тоже то, что стоит увидеть.
 */
function свойПрофильВРазработке(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    return new URLSearchParams(location.search).has('свой')
  } catch {
    return false
  }
}
