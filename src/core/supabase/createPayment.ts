import { supabase } from '.'

interface PaymentData {
  telegram_id: string
  amount: number
  OutSum: string
  InvId: string
  inv_id: string
  currency: string
  stars: number
  status: string
  payment_method: string
  bot_name: string
  description: string
  metadata?: {
    payment_method: string
    email?: string
    subscription?: string
    stars?: number
  }
  language: string
  invoice_url: string
  subscription?: string
}

export async function createPayment(data: PaymentData) {
  const { error } = await supabase.from('payments_v2').insert([
    {
      user_id: data.telegram_id,
      level: data.stars.toString(),
      metadata: {
        ...data,
        created_at: new Date().toISOString(),
      },
    },
  ])

  if (error) {
    console.error('❌ Error creating payment:', error)
    throw new Error(`Failed to create payment: ${error.message}`)
  }

  console.log('✅ Payment created successfully:', data)
}
