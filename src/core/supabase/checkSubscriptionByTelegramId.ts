import { supabase } from '.'

export async function checkSubscriptionByTelegramId(
  telegram_id: string
): Promise<string> {
  // Получаем user_id по telegram_id из таблицы users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('user_id')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (userError) {
    console.error(
      'checkSubscriptionByTelegramId: Ошибка при получении user_id:',
      userError
    )
    return 'unsubscribed'
  }

  const user_id = userData?.user_id

  // Получаем последнюю подписку пользователя
  const { data: subscriptionData, error: subscriptionError } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', user_id)
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
