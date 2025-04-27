import { createServer } from 'vite'
import { startBot } from './bot'
import nodeResolve from '@rollup/plugin-node-resolve'

/**
 * Скрипт для запуска Telegram-бота в режиме разработки с поддержкой Vite
 * Vite обеспечивает быструю компиляцию и горячую перезагрузку
 */
async function startDevServer() {
  try {
    console.log('🚀 Запуск сервера разработки Vite...')

    // Создаем сервер Vite
    const server = await createServer({
      // Настраиваем оптимизированную сборку для серверных приложений
      server: {
        hmr: {
          port: 3001,
        },
      },
      optimizeDeps: {
        // Включаем важные Node.js модули
        include: ['fs', 'path', 'buffer', 'events', 'util', 'stream'],
        exclude: ['winston', 'telegraf'],
        force: true,
      },
      clearScreen: false, // Не очищаем консоль при перезагрузке
      resolve: {
        alias: {
          // Используем node: префикс для встроенных модулей Node.js
          fs: 'node:fs',
          'fs/promises': 'node:fs/promises',
          path: 'node:path',
        },
      },
      // Определяем тип приложения для лучшей совместимости
      appType: 'custom',
      // Добавляем plugins для лучшей работы с Node.js модулями
      plugins: [
        nodeResolve({
          preferBuiltins: true,
          browser: false,
        }),
      ],
    })

    // Запускаем сервер Vite
    await server.listen()
    server.printUrls()

    console.log('✅ Vite-сервер успешно запущен')

    // Запускаем основной бот
    await startBot()

    console.log('🤖 Бот запущен в режиме разработки через Vite')

    // Регистрируем обработчик для graceful shutdown
    const shutdown = async () => {
      console.log('👋 Завершение работы...')
      await server.close()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (error) {
    console.error('❌ Ошибка запуска Vite-сервера:', error)
    process.exit(1)
  }
}

// Запускаем сервер разработки
startDevServer().catch(error => {
  console.error('❌ Критическая ошибка:', error)
  process.exit(1)
})

// Экспортируем startBot как точку входа для Vite plugin Node
export { startBot }

// Если запущено напрямую
if (require.main === module) {
  console.log('📢 Запуск бота напрямую через Vite...')
  startBot().catch(error => {
    console.error('❌ Ошибка запуска бота:', error)
    process.exit(1)
  })
}
