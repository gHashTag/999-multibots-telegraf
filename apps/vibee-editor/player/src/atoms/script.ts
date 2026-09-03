// ===============================
// Script Atom - AI Script Generator (Scenario Page)
// Central hub for generating all video content from a single topic
// ===============================

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  PLATFORM_LIMITS,
  STORAGE_KEYS,
  SCRIPT_NICHE_OPTIONS,
  SCRIPT_STYLE_OPTIONS,
  SCRIPT_DURATION_OPTIONS,
  type ScriptNiche,
  type ScriptStyle,
  type ScriptDuration,
} from '@vibee/atoms'
import { SafeBetaCapabilityError } from '@/config/safeBeta'

// ===============================
// Types - Re-exported from @vibee/atoms
// ===============================

export type { ScriptNiche, ScriptStyle, ScriptDuration }

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'telegram'

export interface BRollSegment {
  startSec: number
  endSec: number
  type: 'video' | 'image'
  prompt: string
  keywords: string[]
}

export interface PlatformCaption {
  platform: Platform
  text: string
  hashtags: string[]
  charLimit: number
}

export interface ScriptInput {
  topic: string
  niche: ScriptNiche
  style: ScriptStyle
  duration: ScriptDuration
  language: 'ru' | 'en'
}

export interface ScriptOutput {
  voiceover: string
  voiceoverWordCount: number
  coverPrompt: string
  broll: BRollSegment[]
  captions: Record<Platform, PlatformCaption>
  generatedAt: number
}

export interface ScriptData {
  input: ScriptInput
  output: ScriptOutput | null
}

export type ScriptOutputTab = 'voiceover' | 'cover' | 'broll' | 'captions'

// ===============================
// Default Values
// ===============================

export const DEFAULT_SCRIPT_INPUT: ScriptInput = {
  topic: '',
  niche: 'other',
  style: 'educational',
  duration: 30,
  language: 'ru',
}

// Re-export from @vibee/atoms with legacy names for backward compatibility
export const NICHE_OPTIONS = SCRIPT_NICHE_OPTIONS
export const STYLE_OPTIONS = SCRIPT_STYLE_OPTIONS
export const DURATION_OPTIONS = SCRIPT_DURATION_OPTIONS

// PLATFORM_LIMITS imported from @vibee/atoms (single source of truth)
// Re-export for use within the player package
export { PLATFORM_LIMITS }

// ===============================
// Parsing Helpers
// ===============================

// Извлекает JSON из markdown code block (```json ... ```)
// Бэкенд иногда возвращает LLM-ответ "как есть" с markdown-обёрткой
function extractJsonFromMarkdown(
  input: unknown
): Record<string, unknown> | null {
  if (typeof input !== 'string') return null

  // Ищем markdown JSON блок (с тегом json/JSON или без)
  // Поддерживаем: ```json, ```JSON, ```, и текст до/после блока
  const jsonMatch = input.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch && jsonMatch[1]) {
    const content = jsonMatch[1].trim()
    // Убедимся что это JSON объект
    if (content.startsWith('{')) {
      try {
        return JSON.parse(content)
      } catch {
        // Попробуем найти JSON внутри контента
      }
    }
  }

  // Ищем JSON объект в любом месте строки
  const jsonObjectMatch = input.match(/\{[\s\S]*"voiceover"[\s\S]*\}/)
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0])
    } catch {
      // Не удалось парсить
    }
  }

  // Если нет markdown wrapper, пробуем как обычный JSON объект
  const trimmed = input.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }

  return null
}

// Извлекает строковое значение из возможного markdown
function extractStringFromMarkdown(input: unknown): string {
  if (typeof input !== 'string') return ''

  // Если содержит markdown блок с JSON - попробуем извлечь конкретное поле
  if (input.includes('```')) {
    const extracted = extractJsonFromMarkdown(input)
    if (extracted && typeof extracted === 'object') {
      // Это был вложенный JSON, вернём пустую строку (обработаем на уровне выше)
      return ''
    }
  }

  return input
}

// Parse B-Roll from API response (may come as string or array)
function parseBroll(broll: unknown): BRollSegment[] {
  if (!broll) return []

  // If already an array, use it
  if (Array.isArray(broll)) {
    return broll.map(item => ({
      startSec: item.startSec ?? item.start_sec ?? 0,
      endSec: item.endSec ?? item.end_sec ?? 5,
      type: item.type || 'video',
      prompt: item.prompt || '',
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
    }))
  }

  // If string, try to parse as JSON
  if (typeof broll === 'string') {
    try {
      const parsed = JSON.parse(broll)
      if (Array.isArray(parsed)) {
        return parseBroll(parsed) // Recurse with parsed array
      }
    } catch {
      // Not valid JSON, return empty
    }
  }

  return []
}

// Parse Captions from API response (may come as string, object, or nested)
function parseCaptions(
  captions: unknown,
  rawOutput: Record<string, unknown>
): Record<Platform, PlatformCaption> {
  const defaultCaptions: Record<Platform, PlatformCaption> = {
    instagram: {
      platform: 'instagram',
      text: '',
      hashtags: [],
      charLimit: 2200,
    },
    tiktok: { platform: 'tiktok', text: '', hashtags: [], charLimit: 4000 },
    youtube: { platform: 'youtube', text: '', hashtags: [], charLimit: 5000 },
    telegram: { platform: 'telegram', text: '', hashtags: [], charLimit: 4096 },
  }

  // Try to parse captions object
  let captionsObj: Record<string, unknown> = {}

  if (typeof captions === 'string') {
    try {
      captionsObj = JSON.parse(captions)
    } catch {
      // Not valid JSON
    }
  } else if (typeof captions === 'object' && captions !== null) {
    captionsObj = captions as Record<string, unknown>
  }

  // Check if we got valid captions
  const platforms: Platform[] = ['instagram', 'tiktok', 'youtube', 'telegram']
  let hasValidCaptions = false

  for (const platform of platforms) {
    const cap = captionsObj[platform] as Record<string, unknown> | undefined
    if (cap && typeof cap === 'object') {
      // Parse individual platform caption
      let text = ''
      if (typeof cap.text === 'string') {
        text = cap.text
      }

      let hashtags: string[] = []
      if (Array.isArray(cap.hashtags)) {
        hashtags = cap.hashtags.map(String)
      } else if (typeof cap.hashtags === 'string') {
        try {
          const parsed = JSON.parse(cap.hashtags)
          if (Array.isArray(parsed)) hashtags = parsed.map(String)
        } catch {
          // Split by space if not JSON
          hashtags = cap.hashtags
            .split(/\s+/)
            .filter((h: string) => h.startsWith('#'))
        }
      }

      if (text) {
        hasValidCaptions = true
        defaultCaptions[platform] = {
          platform,
          text,
          hashtags,
          charLimit: PLATFORM_LIMITS[platform],
        }
      }
    }
  }

  // If no valid captions found, try to generate from voiceover
  if (!hasValidCaptions && rawOutput.voiceover) {
    const voiceoverText =
      typeof rawOutput.voiceover === 'string'
        ? rawOutput.voiceover
        : ((rawOutput.voiceover as Record<string, unknown>)
            ?.voiceover as string) || ''

    if (voiceoverText) {
      // Use voiceover as base caption text
      for (const platform of platforms) {
        defaultCaptions[platform] = {
          platform,
          text: voiceoverText.slice(0, PLATFORM_LIMITS[platform]),
          hashtags: [],
          charLimit: PLATFORM_LIMITS[platform],
        }
      }
    }
  }

  return defaultCaptions
}

// ===============================
// State Atoms
// ===============================

// Current script data (persisted)
export const scriptDataAtom = atomWithStorage<ScriptData | null>(
  STORAGE_KEYS.scriptData,
  null
)

// Script input form state
export const scriptInputAtom = atom<ScriptInput>(DEFAULT_SCRIPT_INPUT)

// Current output tab
export const scriptOutputTabAtom = atom<ScriptOutputTab>('voiceover')

// Generation state
export const isGeneratingScriptAtom = atom(false)
export const scriptErrorAtom = atom<string | null>(null)

// History of generated scripts
export const scriptHistoryAtom = atomWithStorage<ScriptData[]>(
  STORAGE_KEYS.scriptHistory,
  []
)

// ===============================
// Prefill Atoms (for integration with other pages)
// ===============================

// Prefill for Avatar page (voiceover text)
export const avatarPrefilledTextAtom = atom<string | null>(null)

// Prefill for Image page (cover prompt)
export const imagePrefilledPromptAtom = atom<string | null>(null)

// Prefill for Video page (b-roll prompts)
export const videoPrefilledPromptsAtom = atom<string[] | null>(null)

// ===============================
// Action Atoms
// ===============================

// Generate script action: immutable SAFE BETA fail-closed boundary.
export const generateScriptAtom = atom(null, async (_get, set) => {
  set(isGeneratingScriptAtom, false)
  set(scriptErrorAtom, new SafeBetaCapabilityError('generate').message)
})

// Use voiceover in Avatar page
export const useVoiceoverInAvatarAtom = atom(null, (get, set) => {
  const data = get(scriptDataAtom)
  if (data?.output?.voiceover) {
    set(avatarPrefilledTextAtom, data.output.voiceover)
  }
})

// Use cover prompt in Image page
export const useCoverInImageAtom = atom(null, (get, set) => {
  const data = get(scriptDataAtom)
  if (data?.output?.coverPrompt) {
    set(imagePrefilledPromptAtom, data.output.coverPrompt)
  }
})

// Use b-roll prompts in Video page
export const useBrollInVideoAtom = atom(null, (get, set) => {
  const data = get(scriptDataAtom)
  if (data?.output?.broll) {
    const prompts = data.output.broll.map(b => b.prompt)
    set(videoPrefilledPromptsAtom, prompts)
  }
})

// Clear script data
export const clearScriptAtom = atom(null, (_get, set) => {
  set(scriptDataAtom, null)
  set(scriptInputAtom, DEFAULT_SCRIPT_INPUT)
  set(scriptErrorAtom, null)
})

// Load script from history
export const loadScriptFromHistoryAtom = atom(
  null,
  (get, set, index: number) => {
    const history = get(scriptHistoryAtom)
    const script = history[index]
    if (script) {
      set(scriptDataAtom, script)
      set(scriptInputAtom, script.input)
    }
  }
)

// ===============================
// Templates (Favorite Presets)
// ===============================

export interface ScriptTemplate {
  id: string
  name: string
  niche: ScriptNiche
  style: ScriptStyle
  duration: ScriptDuration
  language: 'ru' | 'en'
}

// Saved templates (persisted)
export const scriptTemplatesAtom = atomWithStorage<ScriptTemplate[]>(
  STORAGE_KEYS.scriptTemplates,
  []
)

// Save current settings as template
export const saveTemplateAtom = atom(null, (get, set, name: string) => {
  const input = get(scriptInputAtom)
  const templates = get(scriptTemplatesAtom)

  const newTemplate: ScriptTemplate = {
    id: `tpl-${Date.now()}`,
    name,
    niche: input.niche,
    style: input.style,
    duration: input.duration,
    language: input.language,
  }

  set(scriptTemplatesAtom, [...templates, newTemplate])
  return newTemplate.id
})

// Load template
export const loadTemplateAtom = atom(null, (get, set, templateId: string) => {
  const templates = get(scriptTemplatesAtom)
  const template = templates.find(t => t.id === templateId)
  if (template) {
    set(scriptInputAtom, prev => ({
      ...prev,
      niche: template.niche,
      style: template.style,
      duration: template.duration,
      language: template.language,
    }))
  }
})

// Delete template
export const deleteScriptTemplateAtom = atom(
  null,
  (get, set, templateId: string) => {
    const templates = get(scriptTemplatesAtom)
    set(
      scriptTemplatesAtom,
      templates.filter(t => t.id !== templateId)
    )
  }
)
