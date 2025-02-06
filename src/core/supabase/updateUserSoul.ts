import { supabase } from '.';

export const updateUserSoul = async (telegram_id: string, company: string, position: string, designation: string) => {
  try {
    const { error } = await supabase.from('users').update({ company, position, designation }).eq('telegram_id', telegram_id.toString());
    if (error) {
      throw new Error(`Ошибка при обновлении пользователя: ${error.message}`);
    }
  } catch (error) {
    console.error('Ошибка в updateUserSoul:', error);
  }
};
