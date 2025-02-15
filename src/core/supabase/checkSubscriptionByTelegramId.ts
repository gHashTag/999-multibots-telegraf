import { supabase } from '.'

export async function checkSubscriptionByTelegramId(
  telegram_id: string
): Promise<string> {
  // Получаем последнюю подписку пользователя
  const { data: subscriptionData, error: subscriptionError } = await supabase
    .from('payments')
    .select('*')
    .eq('telegram_id', telegram_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (subscriptionError) {
    console.error(
      'Ошибка при получении информации о подписке:',
      subscriptionError
    )
    return 'unsubscribed'
  }

  if (!subscriptionData) {
    return 'unsubscribed'
  }

  // Проверяем, была ли подписка куплена меньше месяца назад
  const subscriptionDate = new Date(subscriptionData.created_at)
  const currentDate = new Date()
  const differenceInDays =
    (currentDate.getTime() - subscriptionDate.getTime()) / (1000 * 3600 * 24)

  if (differenceInDays > 30) {
    return 'unsubscribed'
  }

  return subscriptionData.level
}
