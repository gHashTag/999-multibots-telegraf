import { describe, it, expect, vi } from 'vitest'
import { createDigitalAvatarBody } from '../index'
import { MyContext } from '@/interfaces'
import { DigitalAvatarBodyDependencies } from '../interfaces/DigitalAvatarBodyDependencies'

// Мокаем адаптер напрямую
import * as avatarBodyGenerator from '../adapters/avatarBodyGenerator'

describe('DigitalAvatarBody Module', () => {
  it('should create digital avatar body', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
    } as unknown as MyContext
    const inputData = {
      /* test data */
    }
    const mockDependencies: DigitalAvatarBodyDependencies = {
      getUserBalance: vi.fn(() => Promise.resolve(100)),
      generateAvatarBody: vi.fn(() => Promise.resolve('mocked_avatar_url')),
      sendGenericErrorMessage: vi.fn(() => Promise.resolve()),
      isRussian: vi.fn(() => true),
    }

    // Мокаем прямой вызов адаптера
    const spy = vi
      .spyOn(avatarBodyGenerator, 'generateAvatarBodyAdapter')
      .mockResolvedValue('mocked_avatar_url')

    // Act
    await createDigitalAvatarBody(mockCtx, inputData, mockDependencies)

    // Assert
    expect(spy).toHaveBeenCalledWith(
      '123',
      'testUser',
      true,
      'testBot',
      inputData
    )
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ваше цифровое тело аватара готово')
    )
  })
})
