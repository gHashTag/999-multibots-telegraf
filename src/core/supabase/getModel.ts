import { supabase } from '.';

export async function getModel(telegram_id: TelegramId): Promise<string> {
  try {
    const { data, error } = await supabase.from('users').select('model').eq('telegram_id', telegram_id).single();

    if (error || !data) throw new Error('Error getModel: ' + error);
    return data?.model;
  } catch (error) {
    throw new Error('Error getModel: ' + error);
  }
}
