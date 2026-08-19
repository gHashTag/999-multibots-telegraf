import { Router } from 'express'
import { logger } from '@/utils/logger'

const router = Router()

/**
 * Мониторинг конкурентов.
 *
 * ДВА ИСПРАВЛЕНИЯ ЗА РАЗ, потому что порознь они бесполезны.
 *
 * 1. ПУТЬ. Здесь было объявлено `/api/competitor-subscriptions`, а роутер
 *    монтируется на `/api` (api_server/index.ts:107) — то есть настоящий адрес
 *    получался `/api/api/competitor-subscriptions`. Проверено на живом сервере:
 *
 *      GET /api/competitor-subscriptions      -> 404
 *      GET /api/api/competitor-subscriptions  -> 400 Missing required parameters
 *
 *    А зовущая сторона (services/competitorMonitoringApiService.ts:48) ходит
 *    именно на `${PUBLIC_URL}/api/competitor-subscriptions`. То есть подписки
 *    не работали никогда.
 *
 * 2. ОТВЕТ. Прежние обработчики были заглушками, которые ОТВЕЧАЛИ УСПЕХОМ:
 *    GET отдавал пустой массив с комментарием «мок ответ для демо», POST —
 *    `{success:true, message:'Subscription created'}`, ничего не создавая.
 *
 *    Одно только исправление пути сделало бы хуже: вместо честного 404
 *    вызывающий начал бы получать «подписка создана» на несуществующую
 *    подписку. Молчаливая подделка успеха опаснее отказа — по этой же причине
 *    в проекте уже пришлось убрать заглушки ElevenLabs, которые возвращали
 *    выдуманный URL и выдуманную расшифровку.
 *
 *    Поэтому отвечаем 501: работы нет, и это видно.
 *
 * Чтобы включить по-настоящему, нужны три вещи, и ни одной из них нет:
 *   - хранилище подписок (таблицы competitor_subscriptions в базе нет)
 *   - формат ответа, который ждёт клиент: GET читает `response.data.subscriptions`
 *     (не `data`), POST — `response.data.subscription`
 *   - обработка ошибок на стороне бота, а не молчаливый пустой список
 */

const NOT_IMPLEMENTED = {
  success: false,
  error: 'competitor monitoring is not implemented',
  detail:
    'Storage for competitor subscriptions does not exist. This endpoint used to ' +
    'answer with a fabricated success; it now refuses so the caller can tell.',
}

router.get('/competitor-subscriptions', async (req, res) => {
  const { user_telegram_id, bot_name } = req.query

  if (!user_telegram_id || !bot_name) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
    })
  }

  logger.warn('[competitor] запрошены подписки, но хранилища нет', {
    user_telegram_id,
    bot_name,
  })
  return res.status(501).json(NOT_IMPLEMENTED)
})

router.post('/competitor-subscriptions', async (req, res) => {
  logger.warn('[competitor] попытка создать подписку, но хранилища нет', {
    user_telegram_id: req.body?.user_telegram_id,
    competitor_username: req.body?.competitor_username,
  })
  return res.status(501).json(NOT_IMPLEMENTED)
})

export default router
