import { supabase } from '.'

export async function setModel(telegram_id: TelegramId, model: string) {
  try {
    await supabase
      .from('users')
      .update({ model })
      .eq('telegram_id', telegram_id)
      .select('*')
  } catch (error) {
    throw new Error('Error setModel: ' + error)
  }
}
