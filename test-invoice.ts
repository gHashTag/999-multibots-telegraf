import { getInvoiceId } from './src/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, PASSWORD1 } from './src/config'

async function testInvoice() {
  try {
    if (!MERCHANT_LOGIN || !PASSWORD1) {
      throw new Error('MERCHANT_LOGIN or PASSWORD1 is not defined')
    }

    const url = await getInvoiceId(
      MERCHANT_LOGIN,
      100,
      Date.now(),
      'Test payment',
      PASSWORD1,
      true
    )
    console.log('Generated URL:', url)
  } catch (error) {
    console.error('Error:', error)
  }
}

testInvoice()
