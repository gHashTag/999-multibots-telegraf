/**
 * Тест для эмуляции Telegram-интерфейса и проверки функциональности самосовершенствования
 * 
 * Этот тест эмулирует общение пользователя с агентом через Telegram
 * и проверяет, как агент обрабатывает запросы на самосовершенствование
 */

import '../utils/websocket-polyfill.js';
import readline from 'readline';
import { createAgent } from '../bot/agent/index.js';
import { TaskType, Task } from '../bot/agent/state.js';
import path from 'path';
import fs from 'fs';

// Создаем интерфейс для чтения ввода пользователя
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Настройки MCP для тестирования
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || `ws://localhost:${process.env.MOCK_SERVER_PORT || '8888'}`;
const MCP_API_KEY = process.env.MCP_API_KEY || 'test-api-key';

// Создаем временную директорию для тестов
const TEST_TMP_DIR = path.join(process.cwd(), 'test-tmp');
if (!fs.existsSync(TEST_TMP_DIR)) {
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
  console.log(`✅ Создана тестовая директория: ${TEST_TMP_DIR}`);
}

// Эмулируем состояние бота Telegram
const telegramState = {
  agent: createAgent({
    id: 'telegram-test-agent',
    mcpConfig: {
      serverUrl: MCP_SERVER_URL,
      apiKey: MCP_API_KEY
    }
  }),
  initialized: false,
  conversations: new Map(),
  chatHistory: [] // Для отображения истории чата
};

// Функция для добавления сообщений в историю чата
const addToHistory = (role: 'user' | 'assistant', message: string) => {
  telegramState.chatHistory.push({ 
    role, 
    message, 
    timestamp: new Date() 
  });
  
  // Выводим чат в консоль
  if (role === 'user') {
    console.log(`\n👤 Пользователь: ${message}`);
  } else {
    console.log(`\n🤖 Бот: ${message}`);
  }
};

// Функция для обработки пользовательского ввода
const processUserInput = async (input: string): Promise<void> => {
  try {
    addToHistory('user', input);
    
    // Проверка на команды
    if (input.startsWith('/')) {
      switch (input) {
        case '/start':
          addToHistory('assistant', '👋 Привет! Я автономный агент-разработчик. Пообщайтесь со мной, чтобы я мог улучшить свои возможности.');
          return;
        case '/help':
          addToHistory('assistant', '🔍 Я могу анализировать запросы на самосовершенствование и создавать файлы. Попробуйте:\n1. "Научись работать с базами данных"\n2. "Создай файл utils/logger.ts с классом для логирования"');
          return;
        case '/improve':
          addToHistory('assistant', '🧠 Опишите, чему мне нужно научиться или что улучшить в моей работе:');
          return;
        case '/create':
          addToHistory('assistant', '📝 Опишите, какой файл мне нужно создать:');
          return;
        case '/background':
          addToHistory('assistant', '🔄 Опишите задачу фонового улучшения:');
          return;
        case '/check_tasks':
          if (!telegramState.initialized) {
            addToHistory('assistant', '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.');
            return;
          }
          
          // Получаем все фоновые задачи
          const allTasks = telegramState.agent.getAllTasks();
          const backgroundTasks = allTasks.filter((task: Task) => 
            task.type === TaskType.BACKGROUND_IMPROVEMENT
          );
          
          if (backgroundTasks.length === 0) {
            addToHistory('assistant', '📊 Нет активных фоновых задач.');
            return;
          }
          
          let statusMessage = '📊 Статус фоновых задач:\n\n';
          
          for (const task of backgroundTasks) {
            statusMessage += `ID: ${task.id}\n`;
            statusMessage += `Статус: ${task.status}\n`;
            statusMessage += `Создана: ${task.created.toLocaleString()}\n`;
            statusMessage += `Задача: ${task.description.substring(0, 50)}${task.description.length > 50 ? '...' : ''}\n`;
            
            if (task.status === 'COMPLETED' && task.result) {
              const createdFiles = task.result.createdFiles || [];
              if (createdFiles.length > 0) {
                statusMessage += `\nСозданные файлы:\n`;
                createdFiles.forEach((file: string) => {
                  statusMessage += `- ${file}\n`;
                });
              }
            }
            
            statusMessage += '\n-----------------\n\n';
          }
          
          addToHistory('assistant', statusMessage);
          return;
        case '/status':
          addToHistory('assistant', `📊 Статус агента: ${telegramState.initialized ? 'активен' : 'не инициализирован'}`);
          return;
        case '/history':
          const historyText = telegramState.chatHistory
            .map(item => `[${item.timestamp.toLocaleTimeString()}] ${item.role === 'user' ? '👤' : '🤖'} ${item.message}`)
            .join('\n');
          console.log(`\n📜 История чата:\n${historyText}`);
          return;
        case '/cleanup':
          // Удаляем все файлы из тестовой директории
          if (fs.existsSync(TEST_TMP_DIR)) {
            fs.readdirSync(TEST_TMP_DIR).forEach(file => {
              const filePath = path.join(TEST_TMP_DIR, file);
              fs.unlinkSync(filePath);
              console.log(`🗑️ Удален файл: ${filePath}`);
            });
            addToHistory('assistant', '🧹 Тестовая директория очищена');
          }
          return;
        case '/exit':
          console.log('👋 Тест завершен. До свидания!');
          await telegramState.agent.shutdown();
          rl.close();
          process.exit(0);
        case '/set_commands':
          addToHistory('assistant', '🔄 Устанавливаю команды бота...');
          
          // Выводим список команд для наглядности
          const commandsList = [
            { command: 'start', description: 'Начать диалог' },
            { command: 'help', description: 'Получить помощь' },
            { command: 'analyze', description: 'Анализ кода' },
            { command: 'generate', description: 'Генерация кода' },
            { command: 'refactor', description: 'Рефакторинг кода' },
            { command: 'test', description: 'Генерация тестов' },
            { command: 'docs', description: 'Создание документации' },
            { command: 'deps', description: 'Управление зависимостями' },
            { command: 'git', description: 'Операции с Git' },
            { command: 'improve', description: 'Запрос на улучшение' },
            { command: 'background', description: 'Запустить фоновое улучшение' },
            { command: 'check_tasks', description: 'Проверить статус фоновых задач' },
            { command: 'status', description: 'Показать статус агента' }
          ];
          
          // Выводим список команд
          let commandsOutput = '📋 Команды бота установлены:\n\n';
          commandsList.forEach(cmd => {
            commandsOutput += `/${cmd.command} - ${cmd.description}\n`;
          });
          
          addToHistory('assistant', commandsOutput);
          return;
        default:
          addToHistory('assistant', '❓ Неизвестная команда. Введите /help для получения списка команд.');
          return;
      }
    }
    
    // Инициализируем агента при необходимости
    if (!telegramState.initialized) {
      console.log('🚀 Инициализация агента...');
      await telegramState.agent.initialize();
      telegramState.initialized = true;
      console.log('✅ Агент успешно инициализирован');
    }
    
    // Определяем, является ли сообщение запросом на самосовершенствование или создание файла
    const selfImprovementKeywords = [
      'научись', 'улучши себя', 'стань лучше', 'совершенствуйся', 
      'развивайся', 'обучись', 'изучи', 'добавь функцию', 
      'обнови', 'оптимизируй', 'улучши свой код'
    ];
    
    const fileCreationKeywords = [
      'создай файл', 'создать файл', 'новый файл', 
      'добавь файл', 'сделай файл', 'напиши файл'
    ];
    
    const backgroundKeywords = [
      'фоновый', 'фоном', 'заднем плане', 'фоновом', 
      'фоновое', 'автоматическое улучшение'
    ];
    
    const isSelfImprovement = selfImprovementKeywords.some(keyword => 
      input.toLowerCase().includes(keyword.toLowerCase())
    );

    const isFileCreation = fileCreationKeywords.some(keyword => 
      input.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const isBackground = backgroundKeywords.some(keyword => 
      input.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // Выбираем тип задачи
    let taskType = TaskType.CODE_GENERATION; // По умолчанию
    
    if (isBackground) {
      console.log('🔄 Обрабатываю запрос на фоновое улучшение...');
      addToHistory('assistant', '🔄 Понял, вы хотите запустить фоновую задачу улучшения. Начинаю работу...');
      
      try {
        if (!telegramState.initialized) {
          console.log('🚀 Инициализация агента...');
          await telegramState.agent.initialize();
          telegramState.initialized = true;
          console.log('✅ Агент успешно инициализирован');
        }
        
        const backgroundTask = await telegramState.agent.startBackgroundImprovement(
          input,
          'test-user-id'
        );
        
        addToHistory('assistant', `🔄 Запущена фоновая задача самосовершенствования (ID: ${backgroundTask.taskId})\n\nЯ буду работать над этим в фоновом режиме и сообщу о результатах.`);
      } catch (error) {
        console.error('Error starting background improvement:', error);
        addToHistory('assistant', `❌ Ошибка при запуске фонового самосовершенствования: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      }
      return;
    } else if (isSelfImprovement || isFileCreation) {
      taskType = TaskType.SELF_IMPROVEMENT;
      
      if (isFileCreation) {
        console.log('📝 Обрабатываю запрос на создание файла...');
        addToHistory('assistant', '📝 Понял, вы хотите создать новый файл. Работаю над этим...');
      } else {
        console.log('🧠 Обрабатываю запрос на самосовершенствование...');
        addToHistory('assistant', '🧠 Понял, вы хотите, чтобы я улучшил свои возможности. Работаю над этим...');
      }
    } else {
      console.log('🔄 Обрабатываю обычный запрос...');
    }
    
    // Обрабатываем сообщение через диалоговый интерфейс агента
    const dialogResult = await telegramState.agent.processDialog(
      'test-user-id',
      input,
      taskType
    );
    
    // Добавляем ответ агента в историю
    addToHistory('assistant', dialogResult.response);
    
    // Если запрос был на создание файла, проверяем, были ли созданы файлы
    if (isFileCreation && dialogResult.result && dialogResult.result.createdFiles) {
      const createdFiles = dialogResult.result.createdFiles;
      if (createdFiles.length > 0) {
        console.log(`✅ Создано файлов: ${createdFiles.length}`);
        createdFiles.forEach(file => console.log(`   - ${file}`));
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка при обработке запроса:', error);
    addToHistory('assistant', `❌ Произошла ошибка: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Основная функция для запуска теста
const runTelegramTest = async (): Promise<void> => {
  try {
    console.log('🧪 Запуск тестирования самосовершенствования и создания файлов через эмуляцию Telegram');
    console.log('📝 Доступные команды:');
    console.log('   /start - Начать диалог');
    console.log('   /help - Получить помощь');
    console.log('   /improve - Запрос на улучшение');
    console.log('   /create - Создать файл');
    console.log('   /background - Запустить фоновое улучшение');
    console.log('   /check_tasks - Проверить статус фоновых задач');
    console.log('   /status - Показать статус агента');
    console.log('   /history - Показать историю чата');
    console.log('   /cleanup - Очистить тестовые файлы');
    console.log('   /exit - Завершить тест');
    console.log('\n💡 Примеры запросов:');
    console.log('   • Создай файл src/utils/logger.ts с классом для логирования');
    console.log('   • Научись взаимодействовать с API сервисов');
    console.log('\n💡 Введите сообщение или команду:');
    
    // Обрабатываем ввод пользователя
    rl.on('line', async (line) => {
      await processUserInput(line.trim());
      console.log('\n💡 Введите следующее сообщение или команду:');
    });
    
    // Обрабатываем выход
    rl.on('close', async () => {
      console.log('👋 Тест завершен. До свидания!');
      if (telegramState.initialized) {
        await telegramState.agent.shutdown();
      }
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    if (telegramState.initialized) {
      await telegramState.agent.shutdown();
    }
    process.exit(1);
  }
};

// Запускаем тест
runTelegramTest(); 