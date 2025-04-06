import { supabase } from '.'

export const getAllUsersData = async () => {
  const { data, error } = await supabase.from('users').select('*') // Select all columns

  if (error) {
    console.error('Error fetching all users data:', error)
    throw new Error(
      `Ошибка при получении данных всех пользователей: ${error.message}`
    )
  }

  return data
}
