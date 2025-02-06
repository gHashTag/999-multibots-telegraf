import { supabase } from '.';

export const getUserBalance = async (telegram_id: number): Promise<number> => {
  const { data, error } = await supabase.from('users').select('balance').eq('telegram_id', telegram_id.toString()).single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.error(`Пользователь с ID ${telegram_id} не найден.`);
      throw new Error('Пользователь не найден');
    }
    console.error('Ошибка при получении баланса:', error);
    throw new Error('Не удалось получить баланс пользователя');
  }

  return data?.balance || 0;
};
