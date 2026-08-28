import type { Request, Response, NextFunction } from 'express'
import { SECRET_API_KEY } from '@/config'
import { logger } from '@/utils/logger'

/**
 * Пропускает только запросы со служебным ключом в заголовке `x-secret-key`.
 *
 * ЗАЧЕМ. Пять маршрутов отдавали внутренние данные БЕЗ ВСЯКОЙ ПРОВЕРКИ —
 * проверено живыми запросами к проду:
 *
 *   GET /api/billing                      финансы по всем ботам: расходы на ИИ,
 *                                         поступления от людей, платежи владельца
 *   GET /api/billing/:botName             то же по одному боту
 *   GET /api/models/:telegramId           чужие обученные модели по номеру
 *   GET /api/diagnostic/trainings/:id     чужие обучения по номеру
 *   GET /api/diagnostic/trainings-recent  последние обучения по всем
 *   GET /api/diagnostic/training-config   настройки, включая начала ключей
 *
 * Номер в Telegram не секрет и легко перебирается, так что «знать URL» защитой
 * не было.
 *
 * ПОЧЕМУ ИМЕННО ТАК. В проекте уже есть общий служебный ключ `SECRET_API_KEY`:
 * его отправляет наш же код в заголовке `x-secret-key`, когда ходит на
 * AI-сервер. Заводить второй механизм ради этих маршрутов — лишняя сущность;
 * берём существующий.
 *
 * ОТКАЗ ЗАКРЫТЫЙ. Если ключ не настроен, маршрут НЕ открывается — он
 * отказывает. Иначе забытая переменная окружения тихо вернула бы всё как было,
 * и починка выглядела бы сделанной.
 */
export function requireInternalKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!SECRET_API_KEY) {
    logger.error(
      '[requireInternalKey] SECRET_API_KEY не настроен — доступ закрыт',
      {
        path: req.path,
      }
    )
    res.status(503).json({
      error: 'internal key is not configured',
      detail: 'Route is closed until SECRET_API_KEY is set.',
    })
    return
  }

  const provided = req.get('x-secret-key')
  if (provided !== SECRET_API_KEY) {
    logger.warn('[requireInternalKey] Отклонён запрос без служебного ключа', {
      path: req.path,
      hasHeader: Boolean(provided),
      ip: req.ip,
    })
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  next()
}
