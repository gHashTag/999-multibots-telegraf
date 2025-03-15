import { MERCHANT_LOGIN, PASSWORD1, RESULT_URL2 } from '@/config'

import { levels } from '@/menu/mainMenu'
import md5 from 'md5'

export const merchantLogin = MERCHANT_LOGIN
export const password1 = PASSWORD1

export const description = 'Покупка звезд'

export const subscriptionTitles = (isRu: boolean) => ({
  neurophoto: isRu ? levels[2].title_ru : levels[2].title_en,
  neurobase: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
  neuroblogger: isRu ? '🤖 НейроБлогер' : '🤖 NeuroBlogger',
})

export const resultUrl2 = RESULT_URL2

export function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): string {
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${encodeURIComponent(
      resultUrl2
    )}:${password1}`
  ).toUpperCase()
  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultUrl2=${encodeURIComponent(
    resultUrl2
  )}`
  console.log('url', url)

  return url
}

export async function getInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  console.log('Start getInvoiceId rubGetWizard', {
    merchantLogin,
    outSum,
    invId,
    description,
    password1,
  })
  try {
    const signatureValue = md5(
      `${merchantLogin}:${outSum}:${invId}:${password1}`
    )
    console.log('signatureValue', signatureValue)

    const response = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )
    console.log('response', response)

    return response
  } catch (error) {
    console.error('Error in getInvoiceId:', error)
    throw error
  }
}
