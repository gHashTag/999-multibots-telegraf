import { directPaymentProcessor } from './src/core/supabase/directPayment'
import { PaymentType } from './src/interfaces/payments.interface'
import { ModeEnum } from './src/interfaces/modes'
import { supabase } from './src/core/supabase/client'

async function testDirectPayment() {
  console.log('🧪 ТЕСТИРОВАНИЕ directPaymentProcessor С 7.5⭐')

  const testParams = {
    telegram_id: '144022504',
    amount: 7.5,
    type: PaymentType.MONEY_OUTCOME,
    description: 'Test payment for 7.5 stars',
    bot_name: 'test_bot',
    service_type: ModeEnum.NeuroPhoto,
    inv_id: 'test-direct-payment-' + Date.now(),
    bypass_payment_check: true,
    metadata: {
      prompt: 'test prompt',
      num_images: 1,
      model_url: 'test_model',
    },
  }

  console.log('📝 Параметры платежа:', testParams)

  try {
    const result = await directPaymentProcessor(testParams)
    console.log('✅ Результат directPaymentProcessor:', result)

    if (result.success && result.payment_id) {
      // Проверяем что записалось в БД
      const { data: paymentData } = await supabase
        .from('payments_v2')
        .select('id, stars, amount')
        .eq('id', result.payment_id)
        .single()

      console.log('🔍 Данные в БД:', paymentData)

      // Удаляем тестовую запись
      await supabase.from('payments_v2').delete().eq('id', result.payment_id)
      console.log('🗑️ Тестовая запись удалена')
    }
  } catch (error) {
    console.error('❌ Ошибка:', error)
  }
}

testDirectPayment().catch(console.error)
