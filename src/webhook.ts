import express from 'express'
import dotenv from 'dotenv'

import bodyParser from 'body-parser'
import { logger } from './utils/logger'
import { getBotTokens as loadTokens } from './utils/config'
import { createBot, BotInstance, BotInfo } from './core/bot'

// Загружаем переменные окружения
dotenv.config()

const PORT = process.env.PORT || 3001
const BASE_URL = process.env.BASE_URL || 'https://example.com'

// Создаем Express приложение
const app = express()
app.use(bodyParser.json())

// Загружаем токены ботов
const tokens = loadTokens()
const bots: BotInstance[] = []

async function setupWebhooks() {
  try {
    logger.info('Начинаем настройку вебхуков для ботов')

    // Создаем и настраиваем каждого бота
    for (const [index, token] of tokens.entries()) {
      try {
        const name = `bot_${index}`
        logger.info(`Настройка бота: ${name}`)

        // Создаем объект BotInfo для вызова функции createBot
        const botInfo: BotInfo = {
          id: name,
          token,
        }

        const bot = await createBot(botInfo)

        if (!bot) {
          logger.error(`Не удалось создать бота ${name}`)
          continue
        }

        // Создаем уникальный путь для вебхука
        const webhookPath = `/bot${token}`
        const webhookUrl = `${BASE_URL}${webhookPath}`

        // Настраиваем вебхук, используя поле instance для доступа к telegram
        await bot.instance.telegram.setWebhook(webhookUrl)
        logger.info(`Webhook установлен для ${name}: ${webhookUrl}`)

        // Настраиваем обработчик для вебхука
        app.use(webhookPath, (req, res) => {
          bot.instance.handleUpdate(req.body, res)
        })

        bots.push(bot)
      } catch (error) {
        logger.error(`Ошибка при настройке бота ${index}:`, error)
      }
    }

    if (bots.length === 0) {
      logger.error(
        'Не удалось настроить ни одного бота. Проверьте токены и интернет-соединение.'
      )
    } else {
      logger.info(`Успешно настроено ботов: ${bots.length}`)
    }

    // Запускаем сервер
    app.listen(PORT, () => {
      logger.info(`Webhook сервер запущен на порту ${PORT}`)
    })
  } catch (error) {
    logger.error('Ошибка при настройке вебхуков:', error)
    process.exit(1)
  }
}

// Обработка выхода из приложения
process.on('SIGINT', () => {
  logger.info('Получен сигнал SIGINT, закрываем соединения')
  bots.forEach(bot => bot.instance.stop())
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM, закрываем соединения')
  bots.forEach(bot => bot.instance.stop())
  process.exit(0)
})

// Запускаем настройку вебхуков
setupWebhooks()
