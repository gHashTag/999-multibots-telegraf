// Валидация данных скрипта с использованием Zod
// TODO: Install zod: npm install zod

import { z } from 'zod';

// ============================================================
// Схемы валидации
// ============================================================

export const BRollSegmentSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  type: z.enum(['video', 'image']),
  prompt: z.string().min(1, 'B-roll prompt cannot be empty'),
  keywords: z.array(z.string()),
}).refine(
  (data) => data.endSec > data.startSec,
  { message: 'End time must be after start time' }
);

export const PlatformCaptionSchema = z.object({
  platform: z.enum(['instagram', 'tiktok', 'youtube', 'telegram']),
  text: z.string().min(1, 'Caption text cannot be empty'),
  hashtags: z.array(z.string()),
  charLimit: z.number().positive(),
}).refine(
  (data) => data.text.length <= data.charLimit,
  (data) => ({ message: `Caption exceeds ${data.platform} limit of ${data.charLimit} characters` })
);

export const ScriptOutputSchema = z.object({
  voiceover: z.string().min(10, 'Voiceover must be at least 10 characters'),
  voiceoverWordCount: z.number().min(1, 'Word count must be positive'),
  coverPrompt: z.string().min(10, 'Cover prompt must be at least 10 characters'),
  broll: z.array(BRollSegmentSchema).min(1, 'At least one B-roll segment required'),
  captions: z.object({
    instagram: PlatformCaptionSchema,
    tiktok: PlatformCaptionSchema,
    youtube: PlatformCaptionSchema,
    telegram: PlatformCaptionSchema,
  }),
  generatedAt: z.number().positive(),
});

export const ScriptInputSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters').max(200, 'Topic too long'),
  niche: z.enum([
    'crypto',
    'fitness',
    'tech',
    'business',
    'lifestyle',
    'travel',
    'food',
    'fashion',
    'gaming',
    'education',
    'entertainment',
    'other',
  ]),
  style: z.enum(['educational', 'entertaining', 'promotional', 'storytelling']),
  duration: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(90)]),
  language: z.enum(['ru', 'en']),
});

// ============================================================
// Типы из схем
// ============================================================

export type BRollSegment = z.infer<typeof BRollSegmentSchema>;
export type PlatformCaption = z.infer<typeof PlatformCaptionSchema>;
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;
export type ScriptInput = z.infer<typeof ScriptInputSchema>;

// ============================================================
// Функции валидации
// ============================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validateScriptInput(input: unknown): ValidationResult<ScriptInput> {
  try {
    const data = ScriptInputSchema.parse(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

export function validateScriptOutput(output: unknown): ValidationResult<ScriptOutput> {
  try {
    const data = ScriptOutputSchema.parse(output);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

// ============================================================
// Частичная валидация (для восстановления данных)
// ============================================================

export function validatePartialOutput(output: unknown): {
  voiceover?: string;
  coverPrompt?: string;
  broll?: BRollSegment[];
  captions?: Record<string, PlatformCaption>;
  errors: string[];
} {
  const result: {
    voiceover?: string;
    coverPrompt?: string;
    broll?: BRollSegment[];
    captions?: Record<string, PlatformCaption>;
    errors: string[];
  } = { errors: [] };

  if (typeof output !== 'object' || output === null) {
    result.errors.push('Output is not an object');
    return result;
  }

  const obj = output as Record<string, unknown>;

  // Validate voiceover
  if (typeof obj.voiceover === 'string' && obj.voiceover.length >= 10) {
    result.voiceover = obj.voiceover;
  } else {
    result.errors.push('Invalid or missing voiceover');
  }

  // Validate coverPrompt
  if (typeof obj.coverPrompt === 'string' && obj.coverPrompt.length >= 10) {
    result.coverPrompt = obj.coverPrompt;
  } else {
    result.errors.push('Invalid or missing cover prompt');
  }

  // Validate broll
  if (Array.isArray(obj.broll)) {
    const validBroll: BRollSegment[] = [];
    obj.broll.forEach((item, index) => {
      const validation = BRollSegmentSchema.safeParse(item);
      if (validation.success) {
        validBroll.push(validation.data);
      } else {
        result.errors.push(`Invalid B-roll segment at index ${index}`);
      }
    });
    if (validBroll.length > 0) {
      result.broll = validBroll;
    }
  } else {
    result.errors.push('Invalid or missing B-roll array');
  }

  // Validate captions
  if (typeof obj.captions === 'object' && obj.captions !== null) {
    const validCaptions: Record<string, PlatformCaption> = {};
    const captionsObj = obj.captions as Record<string, unknown>;

    ['instagram', 'tiktok', 'youtube', 'telegram'].forEach((platform) => {
      const caption = captionsObj[platform];
      const validation = PlatformCaptionSchema.safeParse(caption);
      if (validation.success) {
        validCaptions[platform] = validation.data;
      } else {
        result.errors.push(`Invalid caption for ${platform}`);
      }
    });

    if (Object.keys(validCaptions).length > 0) {
      result.captions = validCaptions;
    }
  } else {
    result.errors.push('Invalid or missing captions object');
  }

  return result;
}

// ============================================================
// Санитизация входных данных
// ============================================================

export function sanitizeTopic(topic: string): string {
  return topic
    .trim()
    // Remove potential prompt injection attempts
    .replace(/system:|assistant:|user:/gi, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Limit length
    .slice(0, 200);
}

export function sanitizeInput(input: ScriptInput): ScriptInput {
  return {
    ...input,
    topic: sanitizeTopic(input.topic),
  };
}
