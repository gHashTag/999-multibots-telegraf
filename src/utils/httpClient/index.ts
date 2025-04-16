import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { logger } from '../logger'

// Типы
export interface HttpRequestConfig {
  method?: string
  headers?: Record<string, string>
  body?: any
  timeout?: number
  params?: Record<string, string>
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'text'
}

export interface HttpResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
  ok: boolean
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
  json: () => Promise<any>
}

// Конвертеры конфигурации
const convertConfig = (config?: HttpRequestConfig): AxiosRequestConfig => ({
  method: config?.method,
  headers: config?.headers,
  timeout: config?.timeout,
  params: config?.params,
  data: config?.body,
  responseType: config?.responseType,
})

// Конвертер ответа
const convertResponse = <T>(response: AxiosResponse<T>): HttpResponse<T> => {
  const responseObj = {
    data: response.data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers as Record<string, string>,
    ok: response.status >= 200 && response.status < 300,
    arrayBuffer: async () => {
      if (response.data instanceof ArrayBuffer) {
        return response.data
      }
      if (typeof response.data === 'string') {
        return new TextEncoder().encode(response.data).buffer
      }
      return new TextEncoder().encode(JSON.stringify(response.data)).buffer
    },
    text: async () => {
      if (response.data instanceof ArrayBuffer) {
        return new TextDecoder().decode(response.data)
      }
      if (typeof response.data === 'string') {
        return response.data
      }
      return JSON.stringify(response.data)
    },
    json: async () => {
      if (typeof response.data === 'string') {
        return JSON.parse(response.data)
      }
      return response.data
    },
  }

  return responseObj
}

// Создание базового клиента
const createAxiosInstance = (baseConfig?: HttpRequestConfig) => {
  const instance = axios.create({
    timeout: baseConfig?.timeout || 30000,
    headers: {
      'Content-Type': 'application/json',
      ...baseConfig?.headers,
    },
  })

  // Логирование запросов
  instance.interceptors.request.use(
    config => {
      logger.info('🌐 HTTP Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
      })
      return config
    },
    error => {
      logger.error('❌ HTTP Request Error:', error)
      return Promise.reject(error)
    }
  )

  // Логирование ответов
  instance.interceptors.response.use(
    response => {
      logger.info('✅ HTTP Response:', {
        status: response.status,
        url: response.config.url,
      })
      return response
    },
    error => {
      logger.error('❌ HTTP Response Error:', {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message,
      })
      return Promise.reject(error)
    }
  )

  return instance
}

// Создание HTTP клиента
export const createHttpClient = (baseConfig?: HttpRequestConfig) => {
  const axiosInstance = createAxiosInstance(baseConfig)

  // Базовый запрос
  const request = async <T>(
    url: string | URL,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> => {
    try {
      const response = await axiosInstance.request<T>({
        url: url.toString(),
        ...convertConfig(config),
      })
      return convertResponse(response)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return convertResponse(error.response)
      }
      throw error
    }
  }

  // HTTP методы
  const get = <T>(
    url: string | URL,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ) => request<T>(url, { ...config, method: 'GET' })

  const post = <T>(
    url: string | URL,
    data?: any,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ) => request<T>(url, { ...config, method: 'POST', body: data })

  const put = <T>(
    url: string | URL,
    data?: any,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ) => request<T>(url, { ...config, method: 'PUT', body: data })

  const delete_ = <T>(
    url: string | URL,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ) => request<T>(url, { ...config, method: 'DELETE' })

  return {
    request,
    get,
    post,
    put,
    delete: delete_,
  }
}

// Создаем дефолтный клиент
export const httpClient = createHttpClient({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Экспортируем методы для удобства
export const { request, get, post, put, delete: delete_ } = httpClient
