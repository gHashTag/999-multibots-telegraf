import { atom } from 'jotai'
import { RENDER_URL } from '../config'
import { apiFetch, explainApiError } from '../lib/apiFetch'

/**
 * Шаблоны, которые сервер РЕАЛЬНО умеет рендерить.
 *
 * Раньше витрина строилась из статического массива в localStorage, где обе
 * записи указывали на одну и ту же композицию SplitTalkingHead. Человек не мог
 * выбрать ни клубный нуар, ни гравюру блога — их просто не существовало в
 * интерфейсе, хотя на сервере они есть.
 *
 * Источник — GET /templates: сервер пересекает витрину с содержимым бандла и
 * отдаёт только то, что действительно рендерится. Рукописный список на
 * клиенте неизбежно расходится с сервером, и это уже стоило падений задач с
 * «Could not find composition».
 */

export interface ServerTemplateField {
  key: string
  label: string
  kind: 'text' | 'media' | 'captions' | 'number' | 'list'
  required?: boolean
  hint?: string
}

export interface ServerTemplate {
  id: string
  title: string
  tagline: string
  about: string
  poster?: string
  sample?: string
  accent: string
  fields: ServerTemplateField[]
  rules: string[]
  width: number
  height: number
  fps: number
  durationInFrames: number
}

export const serverTemplatesAtom = atom<ServerTemplate[]>([])
export const serverTemplatesLoadingAtom = atom<boolean>(false)
/** Пусто — значит ошибки не было. Пустой список шаблонов это другое состояние. */
export const serverTemplatesErrorAtom = atom<string>('')

export const loadServerTemplatesAtom = atom(null, async (get, set) => {
  if (get(serverTemplatesLoadingAtom)) return
  set(serverTemplatesLoadingAtom, true)
  set(serverTemplatesErrorAtom, '')
  try {
    const data = await apiFetch<{ templates?: ServerTemplate[] }>(
      `${RENDER_URL}/templates`
    )
    set(serverTemplatesAtom, Array.isArray(data?.templates) ? data.templates : [])
  } catch (e) {
    // Причина показывается человеку: молчаливый пустой список неотличим от
    // «шаблонов нет», и чинить такое вслепую невозможно.
    set(serverTemplatesErrorAtom, explainApiError(e))
    set(serverTemplatesAtom, [])
  } finally {
    set(serverTemplatesLoadingAtom, false)
  }
})
