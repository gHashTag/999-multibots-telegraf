import type { Context } from 'telegraf'

export async function handlePaymentPolicyInfo(ctx: Context) {
  const isRu = ctx.from?.language_code === 'ru'
  await ctx.answerCbQuery() // Закрыть уведомление о нажатии кнопки
  const message = isRu
    ? `💳 Оплата производится через систему Robokassa\n\n📦 Услуги предоставляются онлайн через вебинары, боты и консультации.\n\n🔄 Возврат средств возможен в течение 14 дней с момента оплаты при условии, что услуга не была оказана.\n\nИП Камская Гея Викторовна\nИНН: 711613594921\nОГРН/ОГРНИП: 317715400010572\n\n📝 Политика обработки персональных данных: Мы соблюдаем требования ФЗ "О персональных данных" от 27.07.2006 N 152-ФЗ.`
    : `💳 Payment is processed through the Robokassa system\n\n📦 Services are provided online through webinars, bots, and consultations.\n\n🔄 Refunds are possible within 14 days of payment if the service was not provided.\n\nIP Kamskaya Geya Viktorovna\nINN: 711613594921\nOGRN/OGRNIP: 317715400010572\n\n📝 Personal data processing policy: We comply with the requirements of the Federal Law "On Personal Data" dated 27.07.2006 N 152-FZ.`
  await ctx.reply(message)
}
