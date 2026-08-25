import { useAtomValue } from 'jotai'
import { myProfileAtom, userAtom, viewedProfileAtom } from '@/atoms'

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

  if (import.meta.env.DEV && import.meta.env.VITE_AGENT_KEY) return true
  if (!profile?.telegram_id) return false

  // У launch-данных Telegram личность лежит в `id` (число), у профиля —
  // в `telegram_id` (строка). `ProfileTabs` сравнивал их как `user.telegram_id`
  // — поля, которого у `TelegramUser` нет вовсе: сравнение всегда давало
  // undefined, то есть «не мой», и держалось только на DEV-ветке.
  const mine = String(profile.telegram_id)
  return (
    mine === String(myProfile?.telegram_id ?? '') ||
    mine === String(user?.id ?? '')
  )
}
