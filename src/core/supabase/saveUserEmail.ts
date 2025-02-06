import { supabase } from '.';

export async function saveUserEmail(telegram_id: string, email: string): Promise<void> {
  const { error } = await supabase.from('users').update({ email }).eq('telegram_id', telegram_id);

  if (error) {
    console.error('Ошибка при сохранении e-mail:', error);
    throw new Error('Не удалось сохранить e-mail пользователя');
  }
}
