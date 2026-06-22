/**
 * Skill Manager — self-improving skills from successful generations.
 * Tables (bot_skills_log, bot_skills) may not exist yet; all queries return empty on error.
 */
import { supabaseAdmin } from '@/core/supabase'
import { logger } from '@/utils/logger'

export interface BotSkill {
  id: string; name: string; description: string; service_type: string
  model: string; prompt_template: string; settings: Record<string, any>
  usage_count: number; rating: number; created_by: string
  is_active: boolean; created_at: string
}

export interface SkillCandidate {
  service_type: string; model: string; prompt_prefix: string
  settings: Record<string, any>; count: number
}

/** Record a generation attempt in bot_skills_log. */
export async function trackGeneration(params: {
  telegram_id: string; service_type: string; prompt: string
  model: string; settings: any; success: boolean
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('bot_skills_log').insert({
      telegram_id: params.telegram_id, service_type: params.service_type,
      prompt: params.prompt, prompt_prefix: params.prompt.substring(0, 50),
      model: params.model, settings: params.settings ?? {}, success: params.success,
    })
    if (error) throw error
  } catch (err) {
    logger.debug('[SkillManager] trackGeneration failed (table may not exist)', { error: String(err) })
  }
}

/** Detect patterns: group by prompt prefix + model, return those with 10+ successes. */
export async function detectSkillCandidate(service_type: string): Promise<SkillCandidate[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('bot_skills_log')
      .select('prompt_prefix, model, settings')
      .eq('service_type', service_type).eq('success', true)
      .order('created_at', { ascending: false }).limit(5000)
    if (error) throw error
    if (!data || data.length === 0) return []

    const groups = new Map<string, { count: number; settings: any }>()
    for (const row of data) {
      const key = `${row.prompt_prefix}::${row.model}`
      const g = groups.get(key)
      if (g) g.count++
      else groups.set(key, { count: 1, settings: row.settings })
    }

    const candidates: SkillCandidate[] = []
    for (const [key, val] of groups) {
      if (val.count >= 10) {
        const [prompt_prefix, model] = key.split('::')
        candidates.push({ service_type, model, prompt_prefix, settings: val.settings, count: val.count })
      }
    }
    return candidates
  } catch (err) {
    logger.debug('[SkillManager] detectSkillCandidate failed', { error: String(err) })
    return []
  }
}

/** Create a reusable skill from detected patterns. */
export async function createSkill(params: {
  name: string; description: string; service_type: string
  model: string; prompt_template: string; settings: any; created_by?: string
}): Promise<BotSkill | null> {
  try {
    const { data, error } = await supabaseAdmin.from('bot_skills').insert({
      name: params.name, description: params.description,
      service_type: params.service_type, model: params.model,
      prompt_template: params.prompt_template, settings: params.settings ?? {},
      usage_count: 0, rating: 0, created_by: params.created_by ?? 'system', is_active: true,
    }).select().single()
    if (error) throw error
    return data as BotSkill
  } catch (err) {
    logger.warn('[SkillManager] createSkill failed', { error: String(err) })
    return null
  }
}

/** List active skills, optionally filtered by service_type. */
export async function listSkills(service_type?: string): Promise<BotSkill[]> {
  try {
    let q = supabaseAdmin.from('bot_skills').select('*')
      .eq('is_active', true).order('usage_count', { ascending: false })
    if (service_type) q = q.eq('service_type', service_type)
    const { data, error } = await q
    if (error) throw error
    return (data as BotSkill[]) ?? []
  } catch { return [] }
}

/** Return a skill's prompt_template + settings for use in generation. */
export async function applySkill(skillId: string): Promise<{ prompt_template: string; settings: Record<string, any> } | null> {
  try {
    const { data, error } = await supabaseAdmin.from('bot_skills')
      .select('prompt_template, settings').eq('id', skillId).eq('is_active', true).single()
    if (error) throw error
    return data as { prompt_template: string; settings: Record<string, any> }
  } catch { return null }
}

/** Bump usage counter for a skill. */
export async function incrementSkillUsage(skillId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('increment_skill_usage', { skill_id: skillId })
    if (error) {
      // Fallback: manual update if RPC doesn't exist
      const { data } = await supabaseAdmin.from('bot_skills')
        .select('usage_count').eq('id', skillId).single()
      if (data) {
        await supabaseAdmin.from('bot_skills')
          .update({ usage_count: (data.usage_count ?? 0) + 1 }).eq('id', skillId)
      }
    }
  } catch { /* non-critical */ }
}

/** Get top skills by usage_count. */
export async function getPopularSkills(limit = 10): Promise<BotSkill[]> {
  try {
    const { data, error } = await supabaseAdmin.from('bot_skills').select('*')
      .eq('is_active', true).order('usage_count', { ascending: false }).limit(limit)
    if (error) throw error
    return (data as BotSkill[]) ?? []
  } catch { return [] }
}
