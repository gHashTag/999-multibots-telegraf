/**
 * Простое объявление типов для axios, чтобы избежать ошибок TypeScript
 */
declare module 'axios' {
  interface AxiosRequestConfig {
    url?: string
    method?: string
    baseURL?: string
    headers?: any
    params?: any
    data?: any
    timeout?: number
    withCredentials?: boolean
    responseType?: string
    [key: string]: any
  }

  interface AxiosInstance {
    (config: AxiosRequestConfig): Promise<AxiosResponse>
    (url: string, config?: AxiosRequestConfig): Promise<AxiosResponse>
    get: <T = any>(
      url: string,
      config?: AxiosRequestConfig
    ) => Promise<AxiosResponse<T>>
    post: <T = any>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ) => Promise<AxiosResponse<T>>
    put: <T = any>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ) => Promise<AxiosResponse<T>>
    delete: <T = any>(
      url: string,
      config?: AxiosRequestConfig
    ) => Promise<AxiosResponse<T>>
    patch: <T = any>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ) => Promise<AxiosResponse<T>>
    request: <T = any>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>
  }

  interface AxiosResponse<T = any> {
    data: T
    status: number
    statusText: string
    headers: any
    config: AxiosRequestConfig
    request?: any
  }

  interface AxiosError<T = any> extends Error {
    config: AxiosRequestConfig
    code?: string
    request?: any
    response?: AxiosResponse<T>
    isAxiosError: boolean
    toJSON(): object
  }

  export function create(config?: AxiosRequestConfig): AxiosInstance
  export function isAxiosError<T = any>(payload: any): payload is AxiosError<T>
  export function all<T>(values: (T | Promise<T>)[]): Promise<T[]>
  export function spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R

  // Добавляем экспорты для интерфейсов
  export { AxiosRequestConfig, AxiosResponse, AxiosError }

  const axios: AxiosInstance & {
    create: typeof create
    CancelToken: any
    isCancel: (value: any) => boolean
    all: typeof all
    spread: typeof spread
    isAxiosError: typeof isAxiosError
  }

  export default axios
}
