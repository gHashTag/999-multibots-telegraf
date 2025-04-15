import { createMockContext } from '@/test-utils/core/mockContext';
import { mockFn } from '@/test-utils/core/mockFunction';
import { uploadVideoScene } from '@/scenes/uploadVideoScene';

const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_FILE_PATH = 'test/file/path.mp4';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface TestResult {
  name: string;
  passed: boolean;
  error?: Error;
}

function createTestContext() {
  const baseContext = createMockContext();
  
  return {
    ...baseContext,
    scene: {
      enter: mockFn(),
      leave: mockFn(),
      reenter: mockFn(),
      state: {}
    },
    wizard: {
      next: mockFn(),
      selectStep: mockFn(),
      state: {
        cursor: 0,
        data: '',
        severity: 0
      }
    },
    session: {
      videoUrl: '',
      balance: 0,
      isAdmin: false,
      language: 'ru'
    },
    telegram: {
      getFile: mockFn().mockResolvedValue({ file_path: TEST_FILE_PATH }),
      getMe: () => Promise.resolve({
        id: TEST_USER_ID,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false
      })
    },
    message: {
      message_id: 1,
      date: Date.now(),
      chat: {
        id: TEST_USER_ID,
        type: 'private',
        first_name: 'Test',
        username: TEST_USERNAME
      },
      from: {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME
      },
      text: ''
    },
    reply: mockFn()
  };
}

function createSceneTest(
  description: string,
  testFn: (ctx: ReturnType<typeof createTestContext>) => Promise<void>
): () => Promise<TestResult> {
  return async () => {
    try {
      const ctx = createTestContext();
      await testFn(ctx);
      return {
        name: description,
        passed: true
      };
    } catch (error) {
      return {
        name: description,
        passed: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
}

/**
 * Тест: Вход в сцену загрузки видео
 */
const testEnterScene = createSceneTest(
  'uploadVideoScene: Enter',
  async (ctx) => {
    const handler = uploadVideoScene.middleware();
    await handler(ctx as any, async () => {});
    
    const replyCall = ctx.reply.mock.calls[0];
    if (!replyCall || !replyCall[0].includes('📹 Пожалуйста, отправьте видеофайл')) {
      throw new Error('Expected welcome message not found');
    }
    
    if (ctx.wizard.next.mock.calls.length !== 1) {
      throw new Error('Expected wizard.next to be called once');
    }
  }
);

/**
 * Тест: Загрузка корректного видео
 */
const testValidVideoUpload = createSceneTest(
  'uploadVideoScene: Valid Video Upload',
  async (ctx) => {
    Object.assign(ctx, {
      message: {
        video: {
          file_id: 'test_file_id',
          file_size: 1024 * 1024 // 1MB
        }
      }
    });
    const handler = uploadVideoScene.middleware();
    await handler(ctx as any, async () => {});
    
    if (ctx.telegram.getFile.mock.calls.length !== 1) {
      throw new Error('Expected telegram.getFile to be called once');
    }
    
    if (ctx.wizard.next.mock.calls.length !== 1) {
      throw new Error('Expected wizard.next to be called once');
    }
    
    if (!ctx.session.videoUrl) {
      throw new Error('Expected videoUrl to be set in session');
    }
  }
);

/**
 * Тест: Загрузка слишком большого видео
 */
const testOversizedVideo = createSceneTest(
  'uploadVideoScene: Oversized Video',
  async (ctx) => {
    Object.assign(ctx, {
      message: {
        video: {
          file_id: 'test_file_id',
          file_size: MAX_FILE_SIZE + 1
        }
      }
    });
    const handler = uploadVideoScene.middleware();
    await handler(ctx as any, async () => {});
    
    const replyCall = ctx.reply.mock.calls[0];
    if (!replyCall || !replyCall[0].includes('⚠️ Ошибка: видео слишком большое')) {
      throw new Error('Expected error message not found');
    }
    
    if (ctx.scene.leave.mock.calls.length !== 1) {
      throw new Error('Expected scene.leave to be called once');
    }
  }
);

/**
 * Тест: Отправка сообщения без видео
 */
const testNoVideo = createSceneTest(
  'uploadVideoScene: No Video',
  async (ctx) => {
    Object.assign(ctx, {
      message: { text: 'not a video' }
    });
    const handler = uploadVideoScene.middleware();
    await handler(ctx as any, async () => {});
    
    const replyCall = ctx.reply.mock.calls[0];
    if (!replyCall || !replyCall[0].includes('❌ Ошибка: видео не предоставлено')) {
      throw new Error('Expected error message not found');
    }
    
    if (ctx.scene.leave.mock.calls.length !== 1) {
      throw new Error('Expected scene.leave to be called once');
    }
  }
);

/**
 * Запуск всех тестов для uploadVideoScene
 */
export async function runUploadVideoSceneTests(): Promise<TestResult[]> {
  const tests = [
    testEnterScene,
    testValidVideoUpload,
    testOversizedVideo,
    testNoVideo
  ];

  const results: TestResult[] = [];
  
  for (const test of tests) {
    const result = await test();
    results.push(result);
  }

  return results;
}

export default runUploadVideoSceneTests;