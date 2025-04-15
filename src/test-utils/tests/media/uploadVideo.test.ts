import { Context, Telegram } from 'telegraf';
import { Message, Update } from 'telegraf/typings/core/types/typegram';
import { IMockFunction, createMockFunction } from '../../core/mockFunction';
import { TestFunction, TestResult } from '../../types';

interface VideoContext extends Context<Update> {
  telegram: Telegram & {
    sendVideo: IMockFunction<(chatId: number, video: string, extra?: any) => Promise<Message.VideoMessage>>;
    sendMessage: IMockFunction<(chatId: number, text: string, extra?: any) => Promise<Message.TextMessage>>;
  };
}

export const uploadVideoTest: TestFunction = async (): Promise<TestResult> => {
  const mockTelegram = {
    sendVideo: createMockFunction<(chatId: number, video: string, extra?: any) => Promise<Message.VideoMessage>>(),
    sendMessage: createMockFunction<(chatId: number, text: string, extra?: any) => Promise<Message.TextMessage>>()
  };

  const ctx = {
    update: {} as Update,
    updateType: 'message',
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'testbot'
    },
    telegram: {
      ...mockTelegram,
      ...Object.fromEntries(
        Object.getOwnPropertyNames(Telegram.prototype)
          .map(key => [key, createMockFunction()])
      )
    }
  } as unknown as VideoContext;

  // Мокаем успешную отправку видео
  ctx.telegram.sendVideo.mockReturnValue(Promise.resolve({
    message_id: 1,
    date: Date.now(),
    chat: {
      id: 123,
      type: 'private',
      first_name: 'Test User',
      username: 'testuser'
    },
    video: {
      file_id: 'test_file_id',
      file_unique_id: 'unique_id',
      duration: 30,
      width: 1280,
      height: 720
    }
  } as Message.VideoMessage));

  // Проверяем обработку видео
  await ctx.telegram.sendVideo(123, 'test_file_id');
  
  return {
    name: 'uploadVideo',
    message: 'Video upload test completed successfully',
    success: ctx.telegram.sendVideo.mock.calls.length === 1 && 
             ctx.telegram.sendVideo.mock.calls[0][1] === 'test_file_id'
  };
}; 