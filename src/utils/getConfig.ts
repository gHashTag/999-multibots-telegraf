import * as dotenv from 'dotenv'

// Интерфейс для конфигурации приложения
export interface Config {
  PORT: number
  WEBHOOK_URL?: string
  WEBHOOK_SECRET?: string
  NODE_ENV: string
  [key: string]: string | number | undefined
}

/**
 * Получает конфигурацию приложения из переменных окружения
 * @returns Объект с конфигурацией
 */
export async function getConfig(): Promise<Config> {
  // Загружаем переменные окружения, если еще не загружены
  dotenv.config()

  // Получаем и валидируем переменные окружения
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

  const config: Config = {
    PORT: port,
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development',
  }

  return config
}
