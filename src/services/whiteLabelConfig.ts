/**
 * ⚠️ ЭТОТ МОДУЛЬ НЕ ИСПОЛНЯЕТСЯ.
 *
 * Импортёров нет вообще — даже через реэкспорт.
 *
 * Кроме того, таблиц white_label_configs в базе НЕТ — проверено
 * запросом к PostgREST (код 42P01). Даже если модуль подключить, он не
 * заработает без схемы.
 *
 * Замеры: docs/audit/table-seams.md, docs/audit/unregistered-functions.md.
 * Инструменты: scripts/probe-table-seams.cjs, scripts/probe-reachability.cjs.
 *
 * Не удаляю: это может быть незаконченная работа, а не мусор — решение о
 * судьбе за владельцем. Пометка нужна, чтобы следующий читатель не принял
 * код за рабочий и не потратил время, как потратил я.
 */
import { supabaseAdmin } from '@/core/supabase'
import { logger } from '@/utils/logger'

export interface WhiteLabelConfig {
  bot_name: string
  brand_name?: string
  welcome_message?: string
  enabled_features: string[]
  disabled_features: string[]
  custom_prices?: Record<string, number>
  support_contact?: string
  logo_url?: string
}

const DEFAULT_FEATURES = [
  'neuro_photo', 'text_to_video', 'image_to_video', 'ai_chat',
  'face_swap', 'lip_sync', 'voice_avatar', 'text_to_speech',
  'image_upscaler', 'ai_photoshop', 'text_to_image',
]

function toConfig(row: any): WhiteLabelConfig {
  return {
    bot_name: row.bot_name,
    brand_name: row.brand_name ?? undefined,
    welcome_message: row.welcome_message ?? undefined,
    enabled_features: row.enabled_features ?? DEFAULT_FEATURES,
    disabled_features: row.disabled_features ?? [],
    custom_prices: row.custom_prices ?? undefined,
    support_contact: row.support_contact ?? undefined,
    logo_url: row.logo_url ?? undefined,
  }
}

export async function getWhiteLabelConfig(botName: string): Promise<WhiteLabelConfig> {
  try {
    const { data, error } = await supabaseAdmin
      .from('white_label_configs')
      .select('*')
      .eq('bot_name', botName)
      .single()

    if (error || !data) {
      return { bot_name: botName, enabled_features: DEFAULT_FEATURES, disabled_features: [] }
    }
    return toConfig(data)
  } catch (err) {
    logger.warn('[WhiteLabel] Table may not exist yet, returning defaults', {
      botName,
      error: err instanceof Error ? err.message : String(err),
    })
    return { bot_name: botName, enabled_features: DEFAULT_FEATURES, disabled_features: [] }
  }
}

export async function updateWhiteLabelConfig(
  botName: string,
  config: Partial<WhiteLabelConfig>,
): Promise<boolean> {
  try {
    const payload = { ...config, bot_name: botName, updated_at: new Date().toISOString() }
    const { error } = await supabaseAdmin
      .from('white_label_configs')
      .upsert(payload, { onConflict: 'bot_name' })

    if (error) {
      logger.error('[WhiteLabel] Failed to update config', { botName, error: error.message })
      return false
    }
    return true
  } catch (err) {
    logger.error('[WhiteLabel] Update error (table may not exist)', {
      botName,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export async function isFeatureEnabled(botName: string, feature: string): Promise<boolean> {
  const cfg = await getWhiteLabelConfig(botName)
  if (cfg.disabled_features.includes(feature)) return false
  if (cfg.enabled_features.length === 0) return true
  return cfg.enabled_features.includes(feature)
}

export async function getCustomWelcome(botName: string): Promise<string | null> {
  const cfg = await getWhiteLabelConfig(botName)
  return cfg.welcome_message ?? null
}
