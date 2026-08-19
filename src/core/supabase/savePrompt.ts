import { supabase } from '@/core/supabase'
import { mirrorToOwnStorage } from './mirrorToStorage'

/**
 * Чем кончилась генерация. Раньше эта функция не умела записывать исход
 * ВООБЩЕ — колонка `status` оставалась пустой у всего, что шло через неё.
 *
 * Цена: на вопрос «часто ли у нас не получается» ответить нечем. Пустой
 * статус ничего не значит — им помечено и удачное, и неудачное. В сентябре
 * 2025 таких 279 при нуле возвратов, в марте 2026 — 233 из 303.
 *
 * Параметр обязательный намеренно: значение по умолчанию рано или поздно
 * проставит «успех» там, где успеха не было.
 */
export type PromptOutcome = 'success' | 'failed'

export const savePrompt = async (
  prompt: string,
  model_type: string,
  media_url: string | undefined,
  telegram_id: number | undefined,
  outcome: PromptOutcome
): Promise<number | null> => {
  // ПЕРЕКЛАДЫВАЕМ ФАЙЛ К СЕБЕ, прежде чем сохранять ссылку.
  //
  // `prompts_history.media_url` — самая крупная течь в базе: 26 791 чужая
  // ссылка против нуля своих. Проверено выборками — replicate.delivery,
  // delivery-us1.bfl.ai, бывшие адреса нашего ai-server и dev-туннели ngrok
  // отдают 404. То есть история генераций у людей есть, а картинок в ней нет.
  //
  // Дедупликация ниже сверяется в том числе по media_url. На поведение это не
  // влияет: ссылка провайдера тоже уникальна для каждой генерации, так что
  // совпадений по ней не было и раньше.
  const storedMediaUrl = media_url
    ? await mirrorToOwnStorage(media_url, telegram_id ?? 'unknown', 'prompts')
    : media_url

  // Проверяем, существует ли уже такой промпт в таблице
  const { data: existingPrompt, error: selectError } = await supabase
    .from('prompts_history')
    .select('prompt_id')
    .eq('prompt', prompt)
    .eq('model_type', model_type)
    .eq('media_url', storedMediaUrl)
    .eq('telegram_id', telegram_id)
    .maybeSingle()

  if (selectError) {
    console.error('Ошибка при проверке существующего промпта:', selectError)
    return null
  }

  if (existingPrompt) {
    return existingPrompt.prompt_id
  }

  // Если промпт не существует, добавляем его в таблицу
  const { data: newPrompt, error } = await supabase
    .from('prompts_history')
    .insert({
      prompt: prompt,
      model_type: model_type,
      media_url: storedMediaUrl,
      telegram_id: telegram_id,
      status: outcome,
    })
    .select()
    .single()

  if (error) {
    console.error('Ошибка при сохранении промпта:', error)
    return null
  }

  return newPrompt.prompt_id
}
