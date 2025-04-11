import { readFileSync } from 'fs'
import path from 'path'
import { logger } from '@/utils/logger'

interface MCPServerConfig {
  command?: string
  url?: string
  env?: Record<string, string>
}

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}

class MCPManager {
  private config: MCPConfig

  constructor() {
    try {
      // Пытаемся загрузить локальную конфигурацию
      const configPath = path.resolve(process.cwd(), 'config.json')
      if (this.fileExists(configPath)) {
        const configContent = readFileSync(configPath, 'utf-8')
        this.config = JSON.parse(configContent)
        logger.info('🔌 MCP конфигурация загружена из файла')
      } else {
        // Если файл не найден, пробуем загрузить из переменных окружения
        this.config = this.loadFromEnv()
        logger.info('🔌 MCP конфигурация загружена из переменных окружения')
      }
    } catch (error) {
      logger.error('❌ Ошибка загрузки MCP конфигурации:', error)
      throw error
    }
  }

  private fileExists(path: string): boolean {
    try {
      readFileSync(path)
      return true
    } catch {
      return false
    }
  }

  private loadFromEnv(): MCPConfig {
    const config: MCPConfig = { mcpServers: {} }

    // Загружаем Replicate
    if (process.env.REPLICATE_API_TOKEN) {
      config.mcpServers.replicate = {
        command: 'mcp-replicate',
        env: {
          REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
        },
      }
    }

    // Загружаем Telegram
    if (process.env.TG_APP_ID && process.env.TG_API_HASH) {
      config.mcpServers['telegram-mcp'] = {
        command: 'telegram-mcp',
        env: {
          TG_APP_ID: process.env.TG_APP_ID,
          TG_API_HASH: process.env.TG_API_HASH,
        },
      }
    }

    // Загружаем URL-based сервисы
    const urlServices = [
      'googlesheets',
      'googlesuper',
      'supabase',
      'gmail',
      'googlemeet',
      'github',
      'hackernews',
      'zoom',
      'coinbase',
    ]

    for (const service of urlServices) {
      const envKey = `MCP_${service.toUpperCase()}_URL`
      const url = process.env[envKey]
      if (url) {
        config.mcpServers[`${service}_composio`] = { url }
      }
    }

    return config
  }

  public getServerConfig(serverName: string): MCPServerConfig | null {
    return this.config.mcpServers[serverName] || null
  }

  public getAllServers(): Record<string, MCPServerConfig> {
    return this.config.mcpServers
  }

  public async connectToServer(serverName: string): Promise<boolean> {
    const serverConfig = this.getServerConfig(serverName)
    if (!serverConfig) {
      logger.error(`❌ Сервер ${serverName} не найден в конфигурации`)
      return false
    }

    try {
      if (serverConfig.command) {
        // Обработка command-based серверов
        logger.info(
          `🚀 Запуск команды для ${serverName}: ${serverConfig.command}`
        )
        // Здесь можно добавить логику запуска команды
      } else if (serverConfig.url) {
        // Обработка URL-based серверов
        logger.info(
          `🔗 Подключение к ${serverName} по URL: ${serverConfig.url}`
        )
        // Здесь можно добавить логику подключения по URL
      }

      return true
    } catch (error) {
      logger.error(`❌ Ошибка подключения к ${serverName}:`, error)
      return false
    }
  }
}

// Экспортируем singleton инстанс
export const mcpManager = new MCPManager()
