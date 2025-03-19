import { supabase } from './'; // Импортируйте клиент Supabase


/**
 * Получает группу для заданного имени бота из таблицы avatars
 * @param botName Имя бота
 * @returns Группа или null, если не найдено
 */
export const getGroupByBotName = async (botName: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('avatars')
      .select('group')
      .eq('bot_name', botName)
      .single();
    
    if (error) {
      console.error(`🚨 Ошибка Supabase: ${error.message}`);
      return null;
    }
    
    if (!data || !data.group) {
      console.log(`⚠️ Группа не найдена для имени бота: ${botName}`);
      return null;
    }
    
    return data.group;
  } catch (error) {
    console.error(`🚨 Ошибка при получении группы: ${error}`);
    return null;
  }
}