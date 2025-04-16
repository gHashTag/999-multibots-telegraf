import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import {
  HttpClient,
  HttpRequestConfig,
  HttpResponse,
  HttpClientFactory,
} from './types'
import { logger } from '../logger'

export class AxiosHttpClient implements HttpClient {
  private client: AxiosInstance

  constructor(baseConfig?: HttpRequestConfig) {
    this.client = axios.create({
      timeout: baseConfig?.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...baseConfig?.headers,
      },
    })

    // Добавляем интерцептор для логирования
    this.client.interceptors.request.use(
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

    this.client.interceptors.response.use(
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
  }

  private convertConfig(config?: HttpRequestConfig): AxiosRequestConfig {
    return {
      method: config?.method,
      headers: config?.headers,
      timeout: config?.timeout,
      params: config?.params,
      data: config?.body,
    }
  }

  private convertResponse<T>(response: AxiosResponse<T>): HttpResponse<T> {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      ok: response.status >= 200 && response.status < 300,
    }
  }

  async request<T>(
    url: string | URL,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    try {
      const response = await this.client.request<T>({
        url: url.toString(),
        ...this.convertConfig(config),
      })
      return this.convertResponse(response)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return this.convertResponse(error.response)
      }
      throw error
    }
  }

  async get<T>(
    url: string | URL,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'GET' })
  }

  async post<T>(
    url: string | URL,
    data?: any,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'POST', body: data })
  }

  async put<T>(
    url: string | URL,
    data?: any,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'PUT', body: data })
  }

  async delete<T>(
    url: string | URL,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'DELETE' })
  }
}

export class AxiosHttpClientFactory implements HttpClientFactory {
  createClient(baseConfig?: HttpRequestConfig): HttpClient {
    return new AxiosHttpClient(baseConfig)
  }
}
