// export type ApiResponse = string | string[] | { output: string } // Старое определение

// Новое определение
export interface ApiResponse {
  success: boolean // Обязательное поле: успех или неудача
  urls?: string[] // Массив URL изображений (опционально, при успехе)
  message?: string // Сообщение об успехе (опционально)
  error?: string // Сообщение об ошибке (опционально, при неуспехе)
  data?: string // Дополнительные данные/строковое представление (опционально)
  // Можно добавить другие поля, если они возвращаются API
}

export interface ApiError extends Error {
  response?: {
    status: number
  }
}
