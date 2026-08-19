/**
 * Проверка того, что «сервер не настроен» и «сервер лежит» — разные вещи.
 *
 * Повод: в проде API_SERVER_URL не задана, и два живых пути собирали адрес
 * по-разному, оба мимо. Один давал строку "undefined/generate/..." (axios
 * падал с ERR_INVALID_URL), другой откатывался на BASE_WEBHOOK_URL, то есть на
 * сам бот, и получал 404 от собственного express.
 *
 * Второй случай коварнее: откат превращает «не настроено» в «настроено
 * неправильно», и по логам это неотличимо от упавшего сервера.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const loadWithConfig = async (config: Record<string, unknown>) => {
  vi.resetModules()
  vi.doMock('@/config', () => config)
  return await import('@/config/aiServer')
}

describe('getAiServerUrl', () => {
  afterEach(() => {
    vi.doUnmock('@/config')
    vi.resetModules()
  })

  it('возвращает null, когда переменная не задана', async () => {
    const { getAiServerUrl, isAiServerConfigured } = await loadWithConfig({
      isDev: false,
      API_SERVER_URL: undefined,
      LOCAL_SERVER_URL: undefined,
    })
    expect(getAiServerUrl()).toBeNull()
    expect(isAiServerConfigured()).toBe(false)
  })

  it('возвращает null для строки "undefined" — это её и записывал шаблон', async () => {
    // `${API_SERVER_URL}/generate/x` при undefined даёт буквально
    // "undefined/generate/x". Ловим это явно, а не ждём падения axios.
    const { getAiServerUrl } = await loadWithConfig({
      isDev: false,
      API_SERVER_URL: 'undefined',
      LOCAL_SERVER_URL: undefined,
    })
    expect(getAiServerUrl()).toBeNull()
  })

  it('возвращает null для адреса без схемы', async () => {
    const { getAiServerUrl } = await loadWithConfig({
      isDev: false,
      API_SERVER_URL: 'ai-server.internal',
      LOCAL_SERVER_URL: undefined,
    })
    expect(getAiServerUrl()).toBeNull()
  })

  it('отдаёт адрес без завершающего слэша', async () => {
    const { getAiServerUrl, isAiServerConfigured } = await loadWithConfig({
      isDev: false,
      API_SERVER_URL: 'https://ai.example.com/',
      LOCAL_SERVER_URL: undefined,
    })
    expect(getAiServerUrl()).toBe('https://ai.example.com')
    expect(isAiServerConfigured()).toBe(true)
  })

  it('в разработке предпочитает локальный адрес', async () => {
    const { getAiServerUrl } = await loadWithConfig({
      isDev: true,
      API_SERVER_URL: 'https://ai.example.com',
      LOCAL_SERVER_URL: 'http://localhost:4000',
    })
    expect(getAiServerUrl()).toBe('http://localhost:4000')
  })

  it('НЕ откатывается на адрес самого бота', async () => {
    // Главная проверка. Прежний API_SERVER_URL_FINAL брал BASE_WEBHOOK_URL,
    // и План А стучался в собственный express, получая 404.
    const { getAiServerUrl } = await loadWithConfig({
      isDev: false,
      API_SERVER_URL: undefined,
      LOCAL_SERVER_URL: undefined,
      BASE_WEBHOOK_URL: 'https://bot.example.com',
      PUBLIC_URL: 'https://bot.example.com',
    })
    expect(getAiServerUrl()).toBeNull()
  })
})
