/**
 * The model you picked is the model the bot names back to you.
 *
 * The avatar wizard offered three models on its keyboard and decided what to
 * call the chosen one with a two-branch ternary:
 *
 *     const modelDisplayName =
 *       selectedModel === 'flux-kontext'
 *         ? 'FLUX Kontext Max (Google)'
 *         : 'SeeDream-4.5 (ByteDance)'
 *
 * Everything that was not FLUX was announced as SeeDream-4.5, so pressing
 * "🍌 Nano Banana" produced a card that said "Selected model: SeeDream-4.5
 * (ByteDance)". It was written twice, in two steps of the same wizard.
 *
 * The card TEXT beside that keyboard described two models and closed with
 * "Both models are free in demo mode" while three buttons were drawn under it,
 * so the third model was invisible until you pressed it -- and then it was
 * called something else.
 *
 * These are the same defect: a list of models kept by hand in four places.
 * This pins the registry that replaced them, including the model added with
 * it, GPT-Image-2.5.
 */
import { describe, it, expect } from 'vitest'
import {
  AVATAR_MODELS,
  avatarModelCard,
  avatarModelDisplayName,
  avatarModelFromButton,
  avatarModelKeyboard,
  avatarModelPriority,
} from '@/scenes/avatarTransformScene/models'

describe('avatar model registry', () => {
  it('gives every model its own display name', () => {
    const names = AVATAR_MODELS.map(m => avatarModelDisplayName(m.id))
    expect(new Set(names).size).toBe(AVATAR_MODELS.length)

    // The exact case the ternary got wrong.
    expect(avatarModelDisplayName('nano-banana')).toContain('Nano Banana')
    expect(avatarModelDisplayName('nano-banana')).not.toContain('SeeDream')
  })

  it('leads with GPT-Image-2.5', () => {
    expect(AVATAR_MODELS[0].id).toBe('gpt-image-25')
    expect(avatarModelDisplayName('gpt-image-25')).toContain('GPT-Image-2.5')
  })

  it('maps every keyboard button back to a model', () => {
    for (const model of AVATAR_MODELS) {
      expect(avatarModelFromButton(model.button)).toBe(model.id)
    }
    expect(avatarModelFromButton('🔙 Назад')).toBeNull()
    expect(avatarModelFromButton('')).toBeNull()
  })

  it('draws exactly the models it describes, in both languages', () => {
    for (const isRu of [true, false]) {
      const card = avatarModelCard(isRu, isRu ? 'Мужской образ' : 'Male style')
      for (const model of AVATAR_MODELS) {
        expect(card).toContain(model.button)
      }
      // The sentence that used to say "both" while three buttons were drawn.
      expect(card).toContain(String(AVATAR_MODELS.length))
      expect(card).not.toContain('Обе модели')
      expect(card).not.toContain('Both models')
    }
  })

  it('puts every model on the keyboard, two per row, with a way back', () => {
    const rows = avatarModelKeyboard(true, true).keyboard as any[][]
    const labels = rows
      .flat()
      .map((b: any) => (typeof b === 'string' ? b : b.text))

    for (const model of AVATAR_MODELS) {
      expect(labels).toContain(model.button)
    }
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(2)
    }
    expect(labels).toContain('🔙 Назад')
    expect(labels).toContain('Отмена')

    // Without the cancel row there is still a way back.
    const noCancel = avatarModelKeyboard(true, false).keyboard as any[][]
    expect(noCancel.flat().map((b: any) => b.text ?? b)).toContain('🔙 Назад')
  })

  it('tries the chosen model first and keeps the rest as fallbacks', () => {
    for (const model of AVATAR_MODELS) {
      const priority = avatarModelPriority(model.id)
      expect(priority[0]).toBe(model.id)
      expect(priority.length).toBe(AVATAR_MODELS.length)
      expect(new Set(priority).size).toBe(AVATAR_MODELS.length)
    }
  })

  it('falls back to the full list when nothing was chosen', () => {
    // A session saved before this list existed holds an id nobody recognises.
    expect(avatarModelPriority(undefined).length).toBe(AVATAR_MODELS.length)
    expect(avatarModelPriority('a-model-that-was-removed')[0]).toBe(
      AVATAR_MODELS[0].id
    )
    expect(avatarModelDisplayName('a-model-that-was-removed')).toBe(
      AVATAR_MODELS[0].displayName
    )
  })
})
