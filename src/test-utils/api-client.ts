import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'

/**
 * Класс для работы с API сервера
 */
export class ApiClient {
  private client: AxiosInstance
  private baseUrl: string

  constructor() {
    this.baseUrl = TEST_CONFIG.server.apiUrl
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: TEST_CONFIG.testOptions.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Добавляем перехватчики для логирования
    this.setupInterceptors()
  }

  /**
   * Настраивает перехватчики для логирования запросов и ответов
   */
  private setupInterceptors() {
    // Перехватчик запросов
    this.client.interceptors.request.use(
      config => {
        logger.debug({
          message: '🔷 API запрос',
          description: 'API request',
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data,
        })
        return config
      },
      error => {
        logger.error({
          message: '❌ Ошибка при отправке API запроса',
          description: 'API request error',
          error: error.message,
        })
        return Promise.reject(error)
      }
    )

    // Перехватчик ответов
    this.client.interceptors.response.use(
      response => {
        logger.debug({
          message: '✅ API ответ получен',
          description: 'API response received',
          status: response.status,
          data: response.data,
        })
        return response
      },
      error => {
        logger.error({
          message: '❌ Ошибка API ответа',
          description: 'API response error',
          status: error.response?.status,
          data: error.response?.data,
          error: error.message,
        })
        return Promise.reject(error)
      }
    )
  }

  /**
   * Выполняет GET-запрос к API
   */
  async get<T>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config)
  }

  /**
   * Выполняет POST-запрос к API
   */
  async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config)
  }

  /**
   * Выполняет PUT-запрос к API
   */
  async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config)
  }

  /**
   * Выполняет DELETE-запрос к API
   */
  async delete<T>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config)
  }

  /**
   * Проверяет доступность API
   */
  async checkApiHealth(): Promise<boolean> {
    try {
      const response = await this.get<{ status: string }>('/api/status')
      return response.data.status === 'online'
    } catch (error) {
      logger.error({
        message: '❌ API недоступен',
        description: 'API health check failed',
        error: error.message,
      })
      return false
    }
  }

  /**
   * Отправляет веб-хук на тестирование
   */
  async sendWebhook(path: string, data: any): Promise<AxiosResponse<any>> {
    try {
      logger.info({
        message: '📤 Отправка веб-хука',
        description: 'Sending webhook',
        path,
        data,
      })

      return await this.post(path, data)
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при отправке веб-хука',
        description: 'Error sending webhook',
        error: error.message,
        path,
      })
      throw error
    }
  }
}
