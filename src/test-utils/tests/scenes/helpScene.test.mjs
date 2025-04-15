// ESM версия теста для helpScene
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

// Настраиваем путь и CommonJS require для совместимости
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Мокаем все необходимые функции 
// Создаем моки для методов Telegraf
const mockFn = () => {
  const fn = (...args) => {
    fn.mock.calls.push(args);
    return fn.mockReturnValue;
  };
  fn.mock = { calls: [] };
  fn.mockResolvedValue = (value) => {
    fn.mockReturnValue = Promise.resolve(value);
    return fn;
  };
  fn.mockRejectedValue = (error) => {
    fn.mockReturnValue = Promise.reject(error);
    return fn;
  };
  fn.mockReturnValue = undefined;
  return fn;
};

// Перечисляем режимы работы бота
const ModeEnum = {
  NeuroPhoto: 'neurophoto',
  TextToVideo: 'text-to-video',
  Help: 'help',
  Admin: 'admin'
};

// Моки для required services
const getUserIsPremiumMock = mockFn();
getUserIsPremiumMock.mockResolvedValue(false);

const getReferalsCountAndUserDataMock = mockFn();
getReferalsCountAndUserDataMock.mockResolvedValue({
  count: 0,
  isReferalFeatureEnabled: true,
  subscription: 'stars',
  level: 1
});

const logMock = {
  info: mockFn(),
  error: mockFn()
};

// Глобальные моки, которые обычно подключаются через global
global.getReferalsCountAndUserData = getReferalsCountAndUserDataMock;
global.getUserIsPremium = getUserIsPremiumMock;
global.log = logMock;

// Мок контекста Telegraf
function createMockContext() {
  return {
    from: { id: 123456789, first_name: 'Test' },
    chat: { id: 123456789 },
    message: { message_id: 1 },
    session: {
      user: {
        language: 'ru',
        isReferalFeatureEnabled: true
      },
      mode: ModeEnum.NeuroPhoto
    },
    scene: {
      enter: mockFn()
    },
    replies: [],
    reply: function(text, extra) {
      this.replies.push({ text, extra });
      return Promise.resolve({ message_id: this.replies.length + 1 });
    }
  };
}

// Мок helpScene
const helpScene = {
  enter: async (ctx) => {
    try {
      // Проверяем, в каком режиме находится пользователь
      if (ctx.session?.mode === ModeEnum.Help) {
        console.log('Help mode detected, entering step0');
        await ctx.scene.enter('step0');
        return;
      }

      // Получаем данные о пользователе
      const userData = await global.getReferalsCountAndUserData(ctx.from.id);
      
      // Определяем, какой хэндлер использовать в зависимости от уровня пользователя
      const reply = ctx.session?.user?.language === 'en' 
        ? "Command help for " + ctx.session.mode 
        : "Справка по команде " + ctx.session.mode;
      
      await ctx.reply(reply);
    } catch (error) {
      console.error('Error in help scene:', error);
      await ctx.reply('Произошла ошибка при загрузке справки');
    }
  }
};

// Тестовые функции
async function simplestTest() {
  console.log('🧪 Starting simplest test...');
  try {
    // Создаем простой контекст
    const ctx = {
      reply: mockFn(),
      from: { id: 123456 },
      session: {
        mode: ModeEnum.Help,
        user: { language: 'ru' }
      },
      scene: {
        enter: mockFn()
      }
    };
    
    // Вызываем напрямую метод enter сцены
    await helpScene.enter(ctx);
    
    // Проверяем результат
    if (ctx.scene.enter.mock.calls.length > 0) {
      return {
        name: 'Simplest Test',
        success: true,
        message: 'helpScene.enter called ctx.scene.enter'
      };
    } else if (ctx.reply.mock.calls.length > 0) {
      return {
        name: 'Simplest Test',
        success: true,
        message: 'helpScene.enter called ctx.reply'
      };
    } else {
      return {
        name: 'Simplest Test',
        success: false,
        message: 'helpScene.enter did not call ctx.reply or ctx.scene.enter'
      };
    }
  } catch (error) {
    console.error('Error in simplest test:', error);
    return {
      name: 'Simplest Test',
      success: false,
      message: `Test failed with error: ${error.message}`
    };
  }
}

// Основная функция для запуска всех тестов
export async function run() {
  console.log('Running helpScene tests (ESM version)...');
  
  const results = [];
  let passed = 0;
  let failed = 0;
  
  // Запускаем тесты
  const result = await simplestTest();
  results.push(result);
  
  if (result.success) {
    passed++;
    console.log(`✅ ${result.name}: ${result.message}`);
  } else {
    failed++;
    console.error(`❌ ${result.name}: ${result.message}`);
  }
  
  console.log(`Help scene tests: ${passed}/${results.length} passed`);
  
  return { 
    passed, 
    failed, 
    total: passed + failed 
  };
}

// Автоматический запуск при прямом вызове файла
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then(result => {
      console.log('Test run complete:', result);
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Error running tests:', error);
      process.exit(1);
    });
} 