import { describe, it, expect, vi } from 'vitest'
import { textToImageWizard } from '../index'
import { MyContext } from '@/interfaces'
import { createTextToImage } from '@/modules/textToImage'
// Временно комментируем ModeEnum, так как путь неверный
// import { ModeEnum } from '../../../config/modes'

describe('TextToImageWizard Scene', () => {
  it('should guide user through text input and generate image successfully', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
      replyWithPhoto: vi.fn(),
      message: { text: 'A beautiful sunset' },
      wizard: {
        next: vi.fn(),
        state: { step: 'enter_prompt' },
      },
      scene: {
        leave: vi.fn(),
        enter: vi.fn(),
      },
      update: { message: { text: 'A beautiful sunset' } },
    } as unknown as MyContext
    vi.spyOn({ createTextToImage }, 'createTextToImage').mockResolvedValue(
      undefined
    )

    // Act - Simulate scene steps directly
    await textToImageWizard.handlers[0](mockCtx)
    await textToImageWizard.handlers[1](mockCtx)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      'Пожалуйста, введите текстовое описание для генерации изображения:',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
    expect(mockCtx.reply).toHaveBeenCalledWith(
      'Обработка вашего запроса на генерацию изображения...',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
    expect({ createTextToImage }.createTextToImage).toHaveBeenCalledWith(
      mockCtx,
      { text: 'A beautiful sunset' },
      {}
    )
    expect(mockCtx.reply).toHaveBeenCalledWith(
      'Генерация завершена!',
      expect.any(Object)
    )
    expect(mockCtx.scene.leave).toHaveBeenCalled()
  })

  it('should prompt again if no text is provided', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
      message: { text: '' },
      wizard: {
        next: vi.fn(),
        state: { step: 'enter_prompt' },
      },
      scene: {
        leave: vi.fn(),
        enter: vi.fn(),
      },
      update: { message: { text: '' } },
    } as unknown as MyContext

    // Act - Simulate second step with empty text
    await textToImageWizard.handlers[0](mockCtx)
    await textToImageWizard.handlers[1](mockCtx)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      'Пожалуйста, введите текстовое описание для изображения.'
    )
    expect(mockCtx.scene.leave).not.toHaveBeenCalled()
  })

  it('should cancel operation and return to main menu if user selects cancel', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
      message: { text: 'Отмена' },
      wizard: {
        next: vi.fn(),
        state: { step: 'enter_prompt' },
      },
      scene: {
        leave: vi.fn(),
        enter: vi.fn(),
      },
      update: { message: { text: 'Отмена' } },
    } as unknown as MyContext

    // Act - Simulate cancel action
    await textToImageWizard.handlers[0](mockCtx)
    await textToImageWizard.handlers[1](mockCtx)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      'Генерация изображения отменена.',
      expect.any(Object)
    )
    expect(mockCtx.scene.leave).toHaveBeenCalled()
  })

  it('should handle error during image generation', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
      replyWithPhoto: vi.fn(),
      message: { text: 'A beautiful sunset' },
      wizard: {
        next: vi.fn(),
        state: { step: 'enter_prompt' },
      },
      scene: {
        leave: vi.fn(),
        enter: vi.fn(),
      },
      update: { message: { text: 'A beautiful sunset' } },
    } as unknown as MyContext
    vi.spyOn({ createTextToImage }, 'createTextToImage').mockRejectedValue(
      new Error('API failure')
    )

    // Act - Simulate error during image generation
    await textToImageWizard.handlers[0](mockCtx)
    await textToImageWizard.handlers[1](mockCtx)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ошибка при генерации изображения: API failure'),
      expect.any(Object)
    )
    expect(mockCtx.scene.leave).toHaveBeenCalled()
  })
})
