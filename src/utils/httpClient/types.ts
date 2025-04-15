export interface HttpRequestConfig {
  method?: string
  headers?: Record<string, string>
  body?: any
  timeout?: number
  params?: Record<string, string>
}

export interface HttpResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
  ok: boolean
}

export interface HttpClient {
  request<T = any>(
    url: string | URL,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>>
  get<T = any>(
    url: string | URL,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>>
  post<T = any>(
    url: string | URL,
    data?: any,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>>
  put<T = any>(
    url: string | URL,
    data?: any,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>>
  delete<T = any>(
    url: string | URL,
    config?: Omit<HttpRequestConfig, 'method' | 'body'>
  ): Promise<HttpResponse<T>>
}

// Тип для фабрики HTTP клиентов
export interface HttpClientFactory {
  createClient(baseConfig?: HttpRequestConfig): HttpClient
}
