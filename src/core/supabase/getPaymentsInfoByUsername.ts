import { Payment } from '@/interfaces/payments.interface';
import { supabase } from '.';

export async function getPaymentsInfoByUsername(username: string): Promise<Payment[]> {
  // Получаем user_id по username из таблицы users
  const { data: userData, error: userError } = await supabase.from('users').select('user_id').eq('username', username).single();

  if (userError) {
    console.error('Error fetching user ID:', userError);
    return [];
  }

  const user_id = userData?.user_id;

  // Получаем все строчки с данным user_id из таблицы payments
  const { data: paymentsData, error: paymentsError } = await supabase.from('payments').select('*').eq('user_id', user_id);

  if (paymentsError) {
    console.error('Error fetching payments info:', paymentsError);
    return [];
  }

  return paymentsData;
}
