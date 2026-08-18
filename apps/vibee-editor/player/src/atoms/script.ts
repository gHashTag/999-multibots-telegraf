// ===============================
// Script Atom - AI Script Generator (Scenario Page)
// Central hub for generating all video content from a single topic
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  PLATFORM_LIMITS,
  STORAGE_KEYS,
  SCRIPT_NICHE_OPTIONS,
  SCRIPT_STYLE_OPTIONS,
  SCRIPT_DURATION_OPTIONS,
  SERVICE_ENDPOINTS,
  type ScriptNiche,
  type ScriptStyle,
  type ScriptDuration,
} from '@vibee/atoms';
import { getErrorMessage } from '@/features/script/utils/errorMessages';
import { validateScriptInput, sanitizeInput } from '@/features/script/utils/validation';
import { captureScriptError, trackScriptGeneration } from '@/lib/sentry';
import { CacheService } from '@/lib/cache';
import { MonitoringService } from '@/lib/monitoring';
import { API_BASE } from '../config';

// ===============================
// Types - Re-exported from @vibee/atoms
// ===============================

export type { ScriptNiche, ScriptStyle, ScriptDuration };

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'telegram';

export interface BRollSegment {
  startSec: number;
  endSec: number;
  type: 'video' | 'image';
  prompt: string;
  keywords: string[];
}

export interface PlatformCaption {
  platform: Platform;
  text: string;
  hashtags: string[];
  charLimit: number;
}

export interface ScriptInput {
  topic: string;
  niche: ScriptNiche;
  style: ScriptStyle;
  duration: ScriptDuration;
  language: 'ru' | 'en';
}

export interface ScriptOutput {
  voiceover: string;
  voiceoverWordCount: number;
  coverPrompt: string;
  broll: BRollSegment[];
  captions: Record<Platform, PlatformCaption>;
  generatedAt: number;
}

export interface ScriptData {
  input: ScriptInput;
  output: ScriptOutput | null;
}

export type ScriptOutputTab = 'voiceover' | 'cover' | 'broll' | 'captions';

// ===============================
// Default Values
// ===============================

export const DEFAULT_SCRIPT_INPUT: ScriptInput = {
  topic: '',
  niche: 'other',
  style: 'educational',
  duration: 30,
  language: 'ru',
};

// Re-export from @vibee/atoms with legacy names for backward compatibility
export const NICHE_OPTIONS = SCRIPT_NICHE_OPTIONS;
export const STYLE_OPTIONS = SCRIPT_STYLE_OPTIONS;
export const DURATION_OPTIONS = SCRIPT_DURATION_OPTIONS;

// PLATFORM_LIMITS imported from @vibee/atoms (single source of truth)
// Re-export for use within the player package
export { PLATFORM_LIMITS };

// ===============================
// Parsing Helpers
// ===============================

// Извлекает JSON из markdown code block (```json ... ```)
// Бэкенд иногда возвращает LLM-ответ "как есть" с markdown-обёрткой
function extractJsonFromMarkdown(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'string') return null;

  // Ищем markdown JSON блок (с тегом json/JSON или без)
  // Поддерживаем: ```json, ```JSON, ```, и текст до/после блока
  const jsonMatch = input.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    const content = jsonMatch[1].trim();
    // Убедимся что это JSON объект
    if (content.startsWith('{')) {
      try {
        return JSON.parse(content);
      } catch {
        // Попробуем найти JSON внутри контента
      }
    }
  }

  // Ищем JSON объект в любом месте строки
  const jsonObjectMatch = input.match(/\{[\s\S]*"voiceover"[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0]);
    } catch {
      // Не удалось парсить
    }
  }

  // Если нет markdown wrapper, пробуем как обычный JSON объект
  const trimmed = input.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  return null;
}

// Извлекает строковое значение из возможного markdown
function extractStringFromMarkdown(input: unknown): string {
  if (typeof input !== 'string') return '';

  // Если содержит markdown блок с JSON - попробуем извлечь конкретное поле
  if (input.includes('```')) {
    const extracted = extractJsonFromMarkdown(input);
    if (extracted && typeof extracted === 'object') {
      // Это был вложенный JSON, вернём пустую строку (обработаем на уровне выше)
      return '';
    }
  }

  return input;
}

// Parse B-Roll from API response (may come as string or array)
function parseBroll(broll: unknown): BRollSegment[] {
  if (!broll) return [];

  // If already an array, use it
  if (Array.isArray(broll)) {
    return broll.map((item) => ({
      startSec: item.startSec ?? item.start_sec ?? 0,
      endSec: item.endSec ?? item.end_sec ?? 5,
      type: item.type || 'video',
      prompt: item.prompt || '',
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
    }));
  }

  // If string, try to parse as JSON
  if (typeof broll === 'string') {
    try {
      const parsed = JSON.parse(broll);
      if (Array.isArray(parsed)) {
        return parseBroll(parsed); // Recurse with parsed array
      }
    } catch {
      // Not valid JSON, return empty
    }
  }

  return [];
}

// Parse Captions from API response (may come as string, object, or nested)
function parseCaptions(
  captions: unknown,
  rawOutput: Record<string, unknown>
): Record<Platform, PlatformCaption> {
  const defaultCaptions: Record<Platform, PlatformCaption> = {
    instagram: { platform: 'instagram', text: '', hashtags: [], charLimit: 2200 },
    tiktok: { platform: 'tiktok', text: '', hashtags: [], charLimit: 4000 },
    youtube: { platform: 'youtube', text: '', hashtags: [], charLimit: 5000 },
    telegram: { platform: 'telegram', text: '', hashtags: [], charLimit: 4096 },
  };

  // Try to parse captions object
  let captionsObj: Record<string, unknown> = {};

  if (typeof captions === 'string') {
    try {
      captionsObj = JSON.parse(captions);
    } catch {
      // Not valid JSON
    }
  } else if (typeof captions === 'object' && captions !== null) {
    captionsObj = captions as Record<string, unknown>;
  }

  // Check if we got valid captions
  const platforms: Platform[] = ['instagram', 'tiktok', 'youtube', 'telegram'];
  let hasValidCaptions = false;

  for (const platform of platforms) {
    const cap = captionsObj[platform] as Record<string, unknown> | undefined;
    if (cap && typeof cap === 'object') {
      // Parse individual platform caption
      let text = '';
      if (typeof cap.text === 'string') {
        text = cap.text;
      }

      let hashtags: string[] = [];
      if (Array.isArray(cap.hashtags)) {
        hashtags = cap.hashtags.map(String);
      } else if (typeof cap.hashtags === 'string') {
        try {
          const parsed = JSON.parse(cap.hashtags);
          if (Array.isArray(parsed)) hashtags = parsed.map(String);
        } catch {
          // Split by space if not JSON
          hashtags = cap.hashtags.split(/\s+/).filter((h: string) => h.startsWith('#'));
        }
      }

      if (text) {
        hasValidCaptions = true;
        defaultCaptions[platform] = {
          platform,
          text,
          hashtags,
          charLimit: PLATFORM_LIMITS[platform],
        };
      }
    }
  }

  // If no valid captions found, try to generate from voiceover
  if (!hasValidCaptions && rawOutput.voiceover) {
    const voiceoverText = typeof rawOutput.voiceover === 'string'
      ? rawOutput.voiceover
      : (rawOutput.voiceover as Record<string, unknown>)?.voiceover as string || '';

    if (voiceoverText) {
      // Use voiceover as base caption text
      for (const platform of platforms) {
        defaultCaptions[platform] = {
          platform,
          text: voiceoverText.slice(0, PLATFORM_LIMITS[platform]),
          hashtags: [],
          charLimit: PLATFORM_LIMITS[platform],
        };
      }
    }
  }

  return defaultCaptions;
}

// ===============================
// State Atoms
// ===============================

// Current script data (persisted)
export const scriptDataAtom = atomWithStorage<ScriptData | null>(
  STORAGE_KEYS.scriptData,
  null
);

// Script input form state
export const scriptInputAtom = atom<ScriptInput>(DEFAULT_SCRIPT_INPUT);

// Current output tab
export const scriptOutputTabAtom = atom<ScriptOutputTab>('voiceover');

// Generation state
export const isGeneratingScriptAtom = atom(false);
export const scriptErrorAtom = atom<string | null>(null);

// History of generated scripts
export const scriptHistoryAtom = atomWithStorage<ScriptData[]>(
  STORAGE_KEYS.scriptHistory,
  []
);

// ===============================
// Prefill Atoms (for integration with other pages)
// ===============================

// Prefill for Avatar page (voiceover text)
export const avatarPrefilledTextAtom = atom<string | null>(null);

// Prefill for Image page (cover prompt)
export const imagePrefilledPromptAtom = atom<string | null>(null);

// Prefill for Video page (b-roll prompts)
export const videoPrefilledPromptsAtom = atom<string[] | null>(null);

// ===============================
// Action Atoms
// ===============================

// Generate script action
export const generateScriptAtom = atom(
  null,
  async (get, set) => {
    const input = get(scriptInputAtom);

    // Validate input
    const validation = validateScriptInput(input);
    if (!validation.success) {
      const errorMsg = validation.errors?.join(', ') || 'Invalid input';
      set(scriptErrorAtom, errorMsg);
      return;
    }

    // Sanitize input
    const sanitizedInput = sanitizeInput(input);

    // Check cache first
    const cacheKey = CacheService.generateKey(sanitizedInput);
    const cached = CacheService.get<ScriptData>(cacheKey);
    
    if (cached) {
      // Return cached result
      set(scriptDataAtom, cached);
      
      // Add to history
      const history = get(scriptHistoryAtom);
      set(scriptHistoryAtom, [cached, ...history.slice(0, 9)]);
      
      // Track cache hit
      trackScriptGeneration(0, true, {
        niche: sanitizedInput.niche,
        style: sanitizedInput.style,
        duration: sanitizedInput.duration,
      });
      
      MonitoringService.trackGeneration({
        success: true,
        duration: 0,
        cached: true,
        niche: sanitizedInput.niche,
        style: sanitizedInput.style,
        duration_seconds: sanitizedInput.duration,
      });
      
      return;
    }

    set(isGeneratingScriptAtom, true);
    set(scriptErrorAtom, null);

    const startTime = Date.now();

    try {
      // Use render server for script generation (has database access)
      // For production, Zig server can be used but needs database connection
      const SCRIPT_API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3333/api/ai/generate-script'
        : `${SERVICE_ENDPOINTS.mcp}/api/ai/generate-script`;

      const MAX_RETRIES = 2;
      let response: Response | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        response = await fetch(SCRIPT_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sanitizedInput),
        });

        if (response.status === 429 && attempt < MAX_RETRIES) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }

      if (!response || !response.ok) {
        if (response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        throw new Error('Failed to generate script');
      }

      let rawOutput: unknown;
      try {
        rawOutput = await response.json();
      } catch {
        // Если response.json() упал, попробуем как текст
        const text = await response.text();
        const extracted = extractJsonFromMarkdown(text);
        if (extracted) {
          rawOutput = extracted;
        } else {
          throw new Error('Invalid API response format');
        }
      }

      // Нормализуем ответ
      let parsedOutput: Record<string, unknown> = {};

      // Новый формат: {success: true, content: "...json string..."}
      if (typeof rawOutput === 'object' && rawOutput !== null && !Array.isArray(rawOutput)) {
        const responseObj = rawOutput as Record<string, unknown>;
        
        // Если есть поле content (новый формат), парсим его
        if (responseObj.content && typeof responseObj.content === 'string') {
          try {
            parsedOutput = JSON.parse(responseObj.content);
          } catch {
            // Если не удалось распарсить, используем как есть
            parsedOutput = responseObj;
          }
        } else if (responseObj.data && typeof responseObj.data === 'object') {
          // Альтернативный новый формат с data
          parsedOutput = responseObj.data as Record<string, unknown>;
        } else {
          // Старый формат - данные на верхнем уровне
          parsedOutput = responseObj;
        }
      }

      // Если rawOutput - это строка, пробуем извлечь JSON
      if (typeof rawOutput === 'string') {
        const extracted = extractJsonFromMarkdown(rawOutput);
        if (extracted) {
          parsedOutput = extracted;
        }
      }

      // Parse and normalize API response
      const output: ScriptOutput = {
        voiceover: typeof parsedOutput.voiceover === 'string'
          ? parsedOutput.voiceover
          : '',
        voiceoverWordCount: Number(parsedOutput.voiceoverWordCount) || 0,
        coverPrompt: (parsedOutput.coverPrompt as string) && parsedOutput.coverPrompt !== 'Professional cover image'
          ? (parsedOutput.coverPrompt as string)
          : `Professional ${input.niche} cover for: ${input.topic}`,
        broll: parseBroll(parsedOutput.broll),
        captions: parseCaptions(parsedOutput.captions, parsedOutput),
        generatedAt: Date.now(),
      };

      // Recalculate word count if needed
      if (!output.voiceoverWordCount && output.voiceover) {
        output.voiceoverWordCount = output.voiceover.split(/\s+/).filter(Boolean).length;
      }

      const scriptData: ScriptData = {
        input,
        output,
      };

      // Save current script
      set(scriptDataAtom, scriptData);

      // Cache the result
      CacheService.set(cacheKey, scriptData);

      // Add to history (max 10 items)
      const history = get(scriptHistoryAtom);
      set(scriptHistoryAtom, [scriptData, ...history.slice(0, 9)]);

      // Track successful generation
      const duration = Date.now() - startTime;
      trackScriptGeneration(duration, true, {
        niche: sanitizedInput.niche,
        style: sanitizedInput.style,
        duration: sanitizedInput.duration,
      });
      
      MonitoringService.trackGeneration({
        success: true,
        duration,
        cached: false,
        niche: sanitizedInput.niche,
        style: sanitizedInput.style,
        duration_seconds: sanitizedInput.duration,
      });

    } catch (error) {
      // Track failed generation
      const duration = Date.now() - startTime;
      trackScriptGeneration(duration, false, {
        niche: sanitizedInput.niche,
        style: sanitizedInput.style,
        duration: sanitizedInput.duration,
      });
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      MonitoringService.trackGeneration({
        success: false,
        duration,
        cached: false,
        niche: sanitizedInput.niche,
        style: sanitizedInput.style,
        duration_seconds: sanitizedInput.duration,
        error: errorMsg,
      });

      // Capture error in Sentry
      captureScriptError(error, {
        topic: sanitizedInput.topic,
        niche: sanitizedInput.niche,
        style: sanitizedInput.style,
        duration: sanitizedInput.duration,
        language: sanitizedInput.language,
      });

      // Use improved error messages
      const lang = get(scriptInputAtom).language;
      const userFacingError = getErrorMessage(error, lang);
      set(scriptErrorAtom, userFacingError);
    } finally {
      set(isGeneratingScriptAtom, false);
    }
  }
);

// Use voiceover in Avatar page
export const useVoiceoverInAvatarAtom = atom(
  null,
  (get, set) => {
    const data = get(scriptDataAtom);
    if (data?.output?.voiceover) {
      set(avatarPrefilledTextAtom, data.output.voiceover);
    }
  }
);

// Use cover prompt in Image page
export const useCoverInImageAtom = atom(
  null,
  (get, set) => {
    const data = get(scriptDataAtom);
    if (data?.output?.coverPrompt) {
      set(imagePrefilledPromptAtom, data.output.coverPrompt);
    }
  }
);

// Use b-roll prompts in Video page
export const useBrollInVideoAtom = atom(
  null,
  (get, set) => {
    const data = get(scriptDataAtom);
    if (data?.output?.broll) {
      const prompts = data.output.broll.map(b => b.prompt);
      set(videoPrefilledPromptsAtom, prompts);
    }
  }
);

// Clear script data
export const clearScriptAtom = atom(
  null,
  (_get, set) => {
    set(scriptDataAtom, null);
    set(scriptInputAtom, DEFAULT_SCRIPT_INPUT);
    set(scriptErrorAtom, null);
  }
);

// Load script from history
export const loadScriptFromHistoryAtom = atom(
  null,
  (get, set, index: number) => {
    const history = get(scriptHistoryAtom);
    const script = history[index];
    if (script) {
      set(scriptDataAtom, script);
      set(scriptInputAtom, script.input);
    }
  }
);

// ===============================
// Templates (Favorite Presets)
// ===============================

export interface ScriptTemplate {
  id: string;
  name: string;
  niche: ScriptNiche;
  style: ScriptStyle;
  duration: ScriptDuration;
  language: 'ru' | 'en';
}

// Saved templates (persisted)
export const scriptTemplatesAtom = atomWithStorage<ScriptTemplate[]>(
  STORAGE_KEYS.scriptTemplates,
  []
);

// Save current settings as template
export const saveTemplateAtom = atom(
  null,
  (get, set, name: string) => {
    const input = get(scriptInputAtom);
    const templates = get(scriptTemplatesAtom);

    const newTemplate: ScriptTemplate = {
      id: `tpl-${Date.now()}`,
      name,
      niche: input.niche,
      style: input.style,
      duration: input.duration,
      language: input.language,
    };

    set(scriptTemplatesAtom, [...templates, newTemplate]);
    return newTemplate.id;
  }
);

// Load template
export const loadTemplateAtom = atom(
  null,
  (get, set, templateId: string) => {
    const templates = get(scriptTemplatesAtom);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      set(scriptInputAtom, (prev) => ({
        ...prev,
        niche: template.niche,
        style: template.style,
        duration: template.duration,
        language: template.language,
      }));
    }
  }
);

// Delete template
export const deleteScriptTemplateAtom = atom(
  null,
  (get, set, templateId: string) => {
    const templates = get(scriptTemplatesAtom);
    set(scriptTemplatesAtom, templates.filter((t) => t.id !== templateId));
  }
);
