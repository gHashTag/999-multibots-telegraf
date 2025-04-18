import { Telegraf } from 'telegraf'
import express from 'express'
import { MyContext } from '@/interfaces'
import { removeWebhooks } from './removeWebhooks'

/**
 * Запускает бота в режиме разработки (polling)
 * @param bot Экземпляр бота
 */
export function development(bot: Telegraf<MyContext>) {
  bot.launch()
}

/**
 * Запускает бота в режиме продакшн (webhook)
 * @param bot Экземпляр бота
 * @param port Порт для запуска сервера
 * @param url URL вебхука
 * @param path Путь для вебхука
 */
export function production(
  bot: Telegraf<MyContext>,
  port: number,
  url: string,
  path: string
) {
  // Удаляем старые вебхуки с обработкой ошибок
  removeWebhooks(bot)
    .then(() => {
      // Настройка сервера Express
      const app = express()

      // Запускаем вебхук
      bot.telegram
        .setWebhook(url)
        .then(() => {
          // Настраиваем сервер
          app.use(bot.webhookCallback(path))
          app.listen(port, () => {
            console.log(`Bot webhook listening on port ${port}`)
          })
        })
        .catch(error => {
          console.error(`Error setting webhook: ${error.message}`)
        })
    })
    .catch(error => {
      console.error(`Failed to initialize webhook: ${error.message}`)
    })
}
