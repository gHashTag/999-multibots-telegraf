const {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
} = require('./dist/scenes/getRuBillWizard/helper')

async function testPayment() {
  try {
    const url = await getInvoiceId(
      merchantLogin,
      100,
      12345,
      description,
      password1,
      true
    )
    console.log('🔗 Тестовый URL для оплаты:', url)
  } catch (error) {
    console.error('❌ Ошибка:', error)
  }
}

testPayment()
