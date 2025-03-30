import { MERCHANT_LOGIN, PASSWORD1, RESULT_URL2 } from '@/config'

import { levels } from '@/menu/mainMenu'
import md5 from 'md5'

export const merchantLogin = MERCHANT_LOGIN
export const password1 = PASSWORD1
export const resultUrl2 = RESULT_URL2
export const description = 'Покупка звезд'

export const subscriptionTitles = (isRu: boolean) => ({
  neurophoto: isRu ? levels[2].title_ru : levels[2].title_en,
  neurobase: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
  neuroblogger: isRu ? '🤖 НейроБлогер' : '🤖 NeuroBlogger',
})

export const generateSignature = (
  merchantLogin: string,
  outSum: number,
  invId: number,
  resultUrl2: string,
  password1: string
): string => {
  console.log('🔍 Generating signature with parameters:')
  console.log('MerchantLogin:', merchantLogin)
  console.log('OutSum:', outSum)
  console.log('InvId:', invId)
  console.log('ResultUrl2:', resultUrl2)

  const signatureString = `${merchantLogin}:${outSum}:${invId}:${resultUrl2}:${password1}`
  console.log('Signature string:', signatureString)

  const signature = md5(signatureString).toUpperCase()
  console.log('Generated signature:', signature)

  return signature
}

export const getInvoiceId = async (
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> => {
  console.log('🚀 Generating invoice with parameters:')
  console.log('MerchantLogin:', merchantLogin)
  console.log('OutSum:', outSum)
  console.log('InvId:', invId)
  console.log('Description:', description)
  console.log('ResultUrl2:', resultUrl2)

  const signatureValue = generateSignature(
    merchantLogin,
    outSum,
    invId,
    resultUrl2,
    password1
  )
  console.log('Using signature:', signatureValue)

  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'

  const params = new URLSearchParams({
    MerchantLogin: merchantLogin,
    OutSum: outSum.toString(),
    InvId: invId.toString(),
    Description: description,
    SignatureValue: signatureValue,
    ResultUrl2: resultUrl2,
  })

  const url = `${baseUrl}?${params.toString()}`
  console.log('Generated URL:', url)

  return url
}
