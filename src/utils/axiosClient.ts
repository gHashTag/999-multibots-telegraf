import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { logger } from './logger'

// Создаем базовый инстанс axios
export const axiosClient = axios.create({
  timeout: 30000, // 30 секунд таймаут по умолчанию
  headers: {
    'Content-Type': 'application/json',
  },
})

// Интерфейс для опций запроса
export interface RequestOptions
  extends Omit<AxiosRequestConfig, 'url' | 'method'> {
  timeout?: number
  headers?: Record<string, string>
  body?: any
}

// Функция для HTTP запросов, имитирующая fetch API
export async function httpRequest(
  url: string | URL,
  options: RequestOptions = {}
): Promise<Response> {
  try {
    const config: AxiosRequestConfig = {
      url: url.toString(),
      method: options.method || 'GET',
      headers: options.headers,
      data: options.body,
      timeout: options.timeout || 30000,
      ...options,
    }

    const response: AxiosResponse = await axiosClient(config)

    // Создаем объект, совместимый с Response из fetch API
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers as Record<string, string>),
      json: async () => response.data,
      text: async () =>
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data),
      blob: async () => new Blob([response.data]),
      arrayBuffer: async () => response.data,
    } as Response
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('❌ HTTP request failed:', {
        url: url.toString(),
        status: error.response?.status,
        message: error.message,
      })
    } else {
      logger.error('❌ Unknown error during HTTP request:', error)
    }
    throw error
  }
}

// Экспортируем также базовый axios инстанс для прямого использования
export { axios }
