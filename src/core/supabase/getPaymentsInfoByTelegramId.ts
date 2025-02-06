import { supabase } from '.';

export interface Payment {
  id: string;
  amount: number;
  date: string;
}

export async function getPaymentsInfoByTelegramId(telegram_id: string): Promise<Payment[]> {
  const { data: userData, error: userError } = await supabase.from('users').select('user_id').eq('telegram_id', telegram_id.toString()).single();

  if (userError || !userData) {
    console.error('Error fetching user ID:', userError);
    return [];
  }

  const user_id = userData.user_id;

  const { data: paymentsData, error: paymentsError } = await supabase.from('payments').select('*').eq('user_id', user_id);

  if (paymentsError || !paymentsData) {
    console.error('Error fetching payments info:', paymentsError);
    return [];
  }

  return paymentsData;
}
