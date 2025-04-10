export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // Определения таблиц можно добавить позже по мере необходимости
    }
    Views: {
      // Определения представлений можно добавить позже по мере необходимости
    }
    Functions: {
      // Определения функций можно добавить позже по мере необходимости
    }
    Enums: {
      // Определения перечислений можно добавить позже по мере необходимости
    }
  }
}
