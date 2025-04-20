/**
 * Tests for lipSyncWizard
 */
import { MiddlewareFn, Scenes } from 'telegraf'
import { lipSyncWizard } from '@/scenes/lipSyncWizard'
import { makeMockContext } from '../utils/makeMockContext'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MyWizardContext, MySession } from '@/interfaces/telegram-bot.interface'
import { Message, User, UserFromGetMe, Update, Chat } from 'telegraf/types'
import { createHelpCancelKeyboard } from '@/menu/createHelpCancelKeyboard/createHelpCancelKeyboard'

// Mock dependencies
jest.mock('@/services/generateLipSync', () => ({ generateLipSync: jest.fn() }))
jest.mock('@/menu/createHelpCancelKeyboard/createHelpCancelKeyboard')
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import { generateLipSync } from '@/services/generateLipSync'

// Типизируем мок
const mockedGenerateLipSync = generateLipSync as jest.MockedFunction<
  typeof generateLipSync
>

// Определяем мок next
const mockNext = jest.fn<() => Promise<void>>()

// Define a type for the scene state
interface LipSyncWizardState {
  step?: number
  audioUrl?: string
  videoUrl?: string
}

// Define the type for the __scenes property within MySession
// This represents the structure Telegraf uses internally
type WizardSessionScenes = Scenes.WizardSessionData & {
  state: LipSyncWizardState;
}

// Revised Helper to create mock context
const createMockContextWithScene = (
  update: Partial<Update>,
  sessionData: Partial<MySession> & { __scenes?: Partial<WizardSessionScenes> } = {}
): MyWizardContext => {
  const stateWithStep: LipSyncWizardState = {
      step: sessionData.__scenes?.state?.step ?? 0,
      ...(sessionData.__scenes?.state ?? {}),
  }

  const fullSession: MySession = {
    images: [],
    targetUserId: '123',
    userModel: { id: 1 },
    cursor: sessionData.cursor ?? 0,
    ...sessionData,
    __scenes: {
      current: 'lipSyncWizard',
      cursor: sessionData.__scenes?.cursor ?? 0,
      state: stateWithStep,
    },
  } as MySession

  return makeMockContext(update, fullSession) as MyWizardContext
}

// Helper to create a base message structure
const createBaseMessage = (fromUser: User, chat: Chat.PrivateChat) => ({
  message_id: Math.floor(Math.random() * 10000),
  date: Math.floor(Date.now() / 1000),
  from: fromUser,
  chat: chat,
})

describe('lipSyncWizard', () => {
  let ctx: MyWizardContext
  const mockFromUser: User = { id: 777, is_bot: false, first_name: 'User' }
  const mockChat: Chat.PrivateChat = { id: 1, type: 'private', first_name: 'User' }
  const mockBotInfo: UserFromGetMe = {
    id: 1, is_bot: true, first_name: 'Bot', username: 'TestBot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  }

  // Get scene steps correctly typed
  const steps = lipSyncWizard.steps as MiddlewareFn<MyWizardContext>[]
  const step0 = steps[0]
  const step1 = steps[1]
  const step2 = steps[2]

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockClear()
  })

  it('should ask for audio file on entry', async () => {
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), text: '/lipsync' } }
    ctx = createMockContextWithScene(update)
    await step0(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, пришлите аудиофайл (MP3, WAV).', {
      reply_markup: { remove_keyboard: true }
    })
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('should ask for video file after receiving audio', async () => {
    const mockSession: Partial<MySession> = {
      __scenes: { state: { step: 0 }, cursor: 0 },
    }
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), audio: { file_id: 'audio_file_id', duration: 5, file_unique_id: 'audio_u_id' } } }
    ctx = createMockContextWithScene(update, mockSession)
    await step1(ctx, mockNext)
    expect((ctx.session.__scenes.state as LipSyncWizardState).audioUrl).toBe('audio_file_id')
    expect(ctx.reply).toHaveBeenCalledWith('Отлично! Теперь пришлите видеофайл (MP4).')
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('should handle missing audio file gracefully', async () => {
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), text: 'some text' } }
    ctx = createMockContextWithScene(update, { __scenes: { state: { step: 1 }, cursor: 1 } })
    await step1(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, пришлите аудиофайл.')
    expect(ctx.wizard.next).not.toHaveBeenCalled()
  })

  it('should process audio and video and leave scene', async () => {
    const mockSession: Partial<MySession> & { __scenes?: { state?: Partial<LipSyncWizardState>, cursor?: number } } = {
      __scenes: { state: { step: 1, audioUrl: 'audio_file_id' }, cursor: 1 },
    }
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), video: { file_id: 'video_file_id', duration: 10, width: 100, height: 100, file_unique_id: 'vid_u_id' } } }
    ctx = createMockContextWithScene(update, mockSession)
    mockedGenerateLipSync.mockResolvedValueOnce(undefined)
    await step2(ctx, mockNext)
    expect((ctx.session.__scenes.state as LipSyncWizardState).videoUrl).toBe('video_file_id')
    expect(ctx.reply).toHaveBeenCalledWith('Начинаю обработку... Это может занять некоторое время.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should handle missing video file gracefully', async () => {
     const mockSession: Partial<MySession> & { __scenes?: { state?: Partial<LipSyncWizardState>, cursor?: number } } = {
       __scenes: { state: { step: 1, audioUrl: 'audio_file_id' }, cursor: 1 },
     }
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), text: 'some text' } }
    ctx = createMockContextWithScene(update, mockSession)
    await step2(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, пришлите видеофайл.')
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should handle /cancel command in step 0', async () => {
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), text: '/cancel' } }
    ctx = createMockContextWithScene(update)
    await step0(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Действие отменено.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should handle /cancel command in step 1', async () => {
    const mockSession: Partial<MySession> & { __scenes?: { state?: Partial<LipSyncWizardState>, cursor?: number } } = {
      __scenes: { state: { step: 1, audioUrl: 'audio_id'}, cursor: 1 },
    }
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), text: '/cancel' } }
    ctx = createMockContextWithScene(update, mockSession)
    await step1(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Действие отменено.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should handle /help command in step 0', async () => {
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), text: '/help' } }
    ctx = createMockContextWithScene(update)
    ;(createHelpCancelKeyboard as jest.Mock).mockReturnValue({ reply_markup: { inline_keyboard: [[{ text: 'Help', callback_data: 'help' }]] } });
    await step0(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Пришлите аудио, затем видео для синхронизации губ.', expect.any(Object))
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should handle /help command in step 1', async () => {
    const mockSession: Partial<MySession> & { __scenes?: { state?: Partial<LipSyncWizardState>, cursor?: number } } = {
      __scenes: { state: { step: 1, audioUrl: 'audio_id'}, cursor: 1 },
    }
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), text: '/help' } }
    ctx = createMockContextWithScene(update, mockSession)
    ;(createHelpCancelKeyboard as jest.Mock).mockReturnValue({ reply_markup: { inline_keyboard: [[{ text: 'Help', callback_data: 'help' }]] } });
    await step1(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Пришлите аудио, затем видео для синхронизации губ.', expect.any(Object))
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should handle unsupported audio format (document)', async () => {
    const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), document: { file_id: 'doc_id', file_unique_id: 'doc_u_id', mime_type: 'application/pdf' } } }
    ctx = createMockContextWithScene(update, { __scenes: { state: { step: 1 }, cursor: 1 } })
    await step1(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, пришлите аудиофайл (MP3, WAV).')
    expect(ctx.wizard.next).not.toHaveBeenCalled()
  })

   it('should handle unsupported video format (document)', async () => {
     const mockSession: Partial<MySession> & { __scenes?: { state?: Partial<LipSyncWizardState>, cursor?: number } } = {
       __scenes: { state: { step: 1, audioUrl: 'audio_file_id' }, cursor: 1 },
     }
     const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), document: { file_id: 'doc_id', file_unique_id: 'doc_u_id', mime_type: 'image/jpeg' } } }
     ctx = createMockContextWithScene(update, mockSession)
     await step2(ctx, mockNext)
     expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, пришлите видеофайл (MP4).')
     expect(ctx.scene.leave).not.toHaveBeenCalled()
   })

    it('should handle error during processing step (step 2)', async () => {
        const mockSession: Partial<MySession> & { __scenes?: { state?: Partial<LipSyncWizardState>, cursor?: number } } = {
          __scenes: { state: { step: 1, audioUrl: 'audio_file_id' }, cursor: 1 },
        }
        const update: Partial<Update> = { update_id: 1, message: { ...createBaseMessage(mockFromUser, mockChat), video: { file_id: 'video_file_id', duration: 10, width: 100, height: 100, file_unique_id: 'vid_u_id' } } }
        ctx = createMockContextWithScene(update, mockSession)
        const testError = new Error('Processing failed');

        mockedGenerateLipSync.mockRejectedValue(testError);

        await step2(ctx, mockNext);

        expect(mockedGenerateLipSync).toHaveBeenCalled();

        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Ошибка обработки'));
        expect(ctx.scene.leave).toHaveBeenCalled();
    });

})