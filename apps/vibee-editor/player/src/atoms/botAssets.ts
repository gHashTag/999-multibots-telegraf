import { atom } from 'jotai'

// ===============================
// История генераций из бота.
//
// Бот пишет каждую генерацию в таблицу assets из 21 места, и до сих пор её не
// читал никто: все обращения к таблице во всём коде были .insert(). Человек
// генерировал в боте и не видел результат здесь — связи не существовало.
// SAFE BETA does not expose the legacy owner-id-in-path history endpoint.
// ===============================

export interface BotAsset {
  id: number
  /** Модель или провайдер: veo3_fast, fal_hummingbird, kling_lipsync, ... */
  type: string
  url: string
  prompt: string | null
  botName: string | null
  createdAt: string
}

export const botAssetsAtom = atom<BotAsset[]>([])
export const botAssetsLoadingAtom = atom(false)
export const botAssetsErrorAtom = atom<string | null>(null)

export const loadBotAssetsAtom = atom(
  null,
  async (_get, set, _kind?: string) => {
    set(botAssetsLoadingAtom, false)
    set(botAssetsAtom, [])
    set(botAssetsErrorAtom, 'Generation history is unavailable in SAFE BETA.')
  }
)

/** Сгруппировано по дню — так историю читают глазами, а не сплошным списком. */
export const botAssetsByDayAtom = atom(get => {
  const groups = new Map<string, BotAsset[]>()
  for (const a of get(botAssetsAtom)) {
    const day = (a.createdAt || '').slice(0, 10)
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(a)
  }
  return [...groups.entries()].map(([day, assets]) => ({ day, assets }))
})
