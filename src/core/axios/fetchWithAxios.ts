import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'

export async function fetchWithAxios(
  url: string,
  options: AxiosRequestConfig
): Promise<AxiosResponse> {
  return axios({ url, ...options })
}
