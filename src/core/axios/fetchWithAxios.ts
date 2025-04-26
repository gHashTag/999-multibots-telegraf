import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { logger } from '@/utils/logger'

export async function fetchWithAxios(
  url: string,
  options: AxiosRequestConfig
): Promise<AxiosResponse> {
  return axios({ url, ...options })
}
