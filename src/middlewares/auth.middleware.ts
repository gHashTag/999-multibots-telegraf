import { Request, Response, NextFunction } from 'express'
import { supabase } from '@/core/supabase/client'

/**
 * Middleware для проверки JWT-токена Supabase и установки данных пользователя в запрос
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Извлекаем токен из заголовка Authorization
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Требуется авторизация'
      })
    }
    
    const token = authHeader.split(' ')[1]
    
    // Проверяем токен через Supabase Auth
    const { data, error } = await supabase.auth.getUser(token)
    
    if (error || !data.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Недействительный токен авторизации' 
      })
    }
    
    // Добавляем данные пользователя в объект запроса
    req.user = data.user
    
    // Продолжаем выполнение запроса
    next()
  } catch (error) {
    console.error('Ошибка авторизации:', error)
    return res.status(500).json({ 
      success: false, 
      message: 'Внутренняя ошибка сервера при проверке авторизации' 
    })
  }
} 