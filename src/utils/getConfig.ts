import fs from 'fs'
import path from 'path'
// import * as dotenv from 'dotenv' // Keep static import removed

// // Load .env file only in non-production environments
// if (process.env.NODE_ENV !== 'production') {
//   // Use require for conditional loading
//   try {
//     const dotenv = require('dotenv');
//     dotenv.config()
//   } catch (error) {
//     console.error("Failed to load dotenv in non-production environment (require):", error);
//   }
// }

import { logger } from '@/utils/logger'

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
