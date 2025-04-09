import dns from 'dns'
import { promisify } from 'util'
import fetch from 'node-fetch'

const lookup = promisify(dns.lookup)

/**
 * Проверяет доступность хоста через DNS
 */
export async function checkHostConnection(hostname: string): Promise<boolean> {
  try {
    console.log('🔍 Проверка DNS для хоста:', {
      description: 'Checking DNS resolution',
      hostname,
    })

    await lookup(hostname)

    console.log('✅ DNS резолвинг успешен:', {
      description: 'DNS resolution successful',
      hostname,
    })

    return true
  } catch (error) {
    console.error('❌ Ошибка DNS резолвинга:', {
      description: 'DNS resolution failed',
      hostname,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Проверяет сетевое подключение к API
 */
export async function checkApiConnection(apiUrl: string): Promise<boolean> {
  try {
    console.log('🔍 Проверка подключения к API:', {
      description: 'Checking API connection',
      url: apiUrl,
    })

    const response = await fetch(apiUrl)
    const isOk = response.ok

    console.log('✅ Проверка API завершена:', {
      description: 'API check completed',
      status: response.status,
      ok: isOk,
    })

    return isOk
  } catch (error) {
    console.error('❌ Ошибка подключения к API:', {
      description: 'API connection failed',
      url: apiUrl,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
