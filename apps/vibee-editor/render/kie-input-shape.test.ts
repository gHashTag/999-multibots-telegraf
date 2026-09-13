import { describe, it, expect } from 'vitest'
import { kieInputFor } from './src/agent/kie-web-provider'
import {
  EDIT_MODEL,
  GPT_IMAGE_25_EDIT_MODELS,
  LEAD_MAGNET_MODEL,
  LEAD_MAGNET_RESOLUTION,
  editInputFor,
  isGptImage25Edit,
} from './src/kie-image'

/**
 * Форма запроса собирается по контракту модели, а не одна на весь вид.
 *
 * Замер 04.09.2026: `google/imagen4` отвечал «aspect_ratio cannot be empty» на
 * запрос с одним `prompt`, а другие модели отказывали на ЛИШНИХ полях. Одна
 * форма на вид не могла быть верной для обеих групп сразу.
 */
describe('вход для KieAI по контракту модели', () => {
  it('отдаёт ровно те поля, которые модель назвала, и ни одного лишнего', () => {
    // google/nano-banana просит только prompt (needs: ['prompt']).
    const вход = kieInputFor('google/nano-banana', {
      prompt: 'кот',
      aspect_ratio: '9:16',
      mode: 'normal',
    })
    expect(вход).toEqual({ prompt: 'кот' })
  })

  it('отдаёт aspect_ratio тем, кто его требует', () => {
    // google/imagen4 просит prompt И aspect_ratio — измерено пробой.
    const вход = kieInputFor('google/imagen4', {
      prompt: 'озеро',
      aspect_ratio: '16:9',
    })
    expect(вход).toEqual({ prompt: 'озеро', aspect_ratio: '16:9' })
  })

  it('ОТКАЗЫВАЕТ до траты, когда требуемого поля нет', () => {
    // Пустое значение — это отсутствие значения: послать его значит заплатить
    // за отказ провайдера вместо того, чтобы отказать самим и бесплатно.
    expect(kieInputFor('google/imagen4', { prompt: 'озеро' })).toBeNull()
    expect(
      kieInputFor('google/imagen4', { prompt: 'озеро', aspect_ratio: '' })
    ).toBeNull()
  })

  it('незнакомой модели отдаёт то, что есть, а не пустоту', () => {
    // Контракт неизвестен — пусть отвечает провайдер. Пустая заявка не
    // сработает заведомо.
    const вход = kieInputFor('нет/такой/модели', { prompt: 'x' })
    expect(вход).toEqual({ prompt: 'x' })
  })
})

/**
 * img2img on Kie speaks two dialects: nano-banana-edit expects `image_urls`,
 * GPT Image 2.5 (flare/sunburst) expects `input_urls` and `resolution`.
 * Documented from docs.kie.ai on 2026-09-13; not yet live-probed from this code.
 */
describe('вход для img2img собирается по модели', () => {
  it('nano-banana-edit: image_urls и aspect_ratio, без resolution', () => {
    const input = editInputFor(EDIT_MODEL, {
      prompt: 'кот',
      imageUrl: 'https://s3.example/a.jpg',
      aspectRatio: '9:16',
    })
    expect(input).toEqual({
      prompt: 'кот',
      image_urls: ['https://s3.example/a.jpg'],
      aspect_ratio: '9:16',
    })
  })

  it('GPT Image 2.5: input_urls, aspect_ratio и resolution 1K (цена лид-магнита)', () => {
    for (const model of GPT_IMAGE_25_EDIT_MODELS) {
      expect(isGptImage25Edit(model)).toBe(true)
      const input = editInputFor(model, {
        prompt: 'кот',
        imageUrl: 'https://s3.example/a.jpg',
        aspectRatio: '9:16',
      })
      expect(input).toEqual({
        prompt: 'кот',
        input_urls: ['https://s3.example/a.jpg'],
        aspect_ratio: '9:16',
        resolution: LEAD_MAGNET_RESOLUTION,
      })
    }
    expect(isGptImage25Edit(EDIT_MODEL)).toBe(false)
    expect(GPT_IMAGE_25_EDIT_MODELS).toContain(LEAD_MAGNET_MODEL)
  })
})
