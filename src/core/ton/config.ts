/**
 * TON Blockchain Configuration
 *
 * Конфигурация для работы с TON блокчейном и USDT Jetton
 */

import { getSecret, getSecretOrDefault } from '../infisical'

// USDT Jetton Master Contract Addresses
export const USDT_MASTER_ADDRESS = {
  mainnet: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  testnet: 'kQD0GKBM8ZbryVk2aESmzfU6b9b_8era_IkvBSELujFZPsyy',
}

// TON Center API Endpoints
export const TONCENTER_API = {
  mainnet: 'https://toncenter.com/api/v2',
  testnet: 'https://testnet.toncenter.com/api/v2',
}

// Decimals
export const DECIMALS = {
  USDT: 6, // 1 USDT = 1,000,000 nano
  TON: 9, // 1 TON = 1,000,000,000 nano
}

// Payment check intervals
export const PAYMENT_CHECK = {
  INTERVAL_MS: 30000, // 30 seconds
  TIMEOUT_MS: 3600000, // 1 hour - после этого платёж отменяется
  MAX_RETRIES: 120, // 120 * 30s = 1 hour
}

/**
 * Получить текущую конфигурацию TON
 */
export function getTonConfig() {
  // TON_NETWORK - опциональный, по умолчанию mainnet
  const network = getSecretOrDefault('TON_NETWORK', 'mainnet')
  const walletAddress = getSecret('TON_WALLET_ADDRESS')
  // TON_API_KEY - опциональный (работает без него, но с лимитами)
  const apiKey = getSecretOrDefault('TON_API_KEY', '')

  if (!walletAddress) {
    throw new Error('TON_WALLET_ADDRESS not configured in Infisical')
  }

  const isMainnet = network === 'mainnet'

  return {
    network: network as 'mainnet' | 'testnet',
    isMainnet,
    walletAddress,
    apiKey,
    usdtMasterAddress: isMainnet
      ? USDT_MASTER_ADDRESS.mainnet
      : USDT_MASTER_ADDRESS.testnet,
    apiEndpoint: isMainnet ? TONCENTER_API.mainnet : TONCENTER_API.testnet,
  }
}

/**
 * Конвертация USDT в nano (6 decimals)
 */
export function usdtToNano(usdt: number): bigint {
  return BigInt(Math.floor(usdt * Math.pow(10, DECIMALS.USDT)))
}

/**
 * Конвертация nano в USDT
 */
export function nanoToUsdt(nano: bigint): number {
  return Number(nano) / Math.pow(10, DECIMALS.USDT)
}

/**
 * Конвертация TON в nanoton (9 decimals)
 */
export function tonToNano(ton: number): bigint {
  return BigInt(Math.floor(ton * Math.pow(10, DECIMALS.TON)))
}

/**
 * Конвертация nanoton в TON
 */
export function nanoToTon(nano: bigint): number {
  return Number(nano) / Math.pow(10, DECIMALS.TON)
}

/**
 * Генерация deep link для оплаты USDT через Tonkeeper/TON Wallet
 *
 * ВАЖНО: Для jetton переводов используется специальный формат URL
 * ton://transfer/{WALLET}?amount={TON_FOR_GAS}&text={COMMENT}&jetton={JETTON_MASTER}
 *
 * Но более надёжный способ - отправить пользователя на универсальную страницу
 */
export function generateTonPaymentLink(params: {
  recipientAddress: string
  usdtAmount: number
  comment: string
  usdtMasterAddress: string
}): string {
  const { recipientAddress, usdtAmount, comment, usdtMasterAddress } = params

  // Сумма в nano USDT
  const amountNano = usdtToNano(usdtAmount)

  // TON deep link для jetton перевода
  // Формат: ton://transfer/{address}?amount={ton_for_gas}&text={comment}&jetton={jetton_master}
  const tonForGas = '100000000' // 0.1 TON для газа

  const url = new URL(`ton://transfer/${recipientAddress}`)
  url.searchParams.set('amount', tonForGas)
  url.searchParams.set('text', comment)
  url.searchParams.set('jetton', usdtMasterAddress)
  url.searchParams.set('jetton-amount', amountNano.toString())

  return url.toString()
}

/**
 * Генерация Tonkeeper deep link (более надёжный для jetton)
 */
export function generateTonkeeperLink(params: {
  recipientAddress: string
  usdtAmount: number
  comment: string
  usdtMasterAddress: string
}): string {
  const { recipientAddress, usdtAmount, comment, usdtMasterAddress } = params
  const amountNano = usdtToNano(usdtAmount)

  // Tonkeeper специальный формат для jetton
  // https://app.tonkeeper.com/transfer/{address}?jetton={master}&amount={nano}&text={comment}
  const url = new URL(`https://app.tonkeeper.com/transfer/${recipientAddress}`)
  url.searchParams.set('jetton', usdtMasterAddress)
  url.searchParams.set('amount', amountNano.toString())
  url.searchParams.set('text', comment)

  return url.toString()
}

/**
 * Генерация deep link для оплаты нативным TON через Tonkeeper
 * Проще чем jetton - без указания контракта токена
 */
export function generateTonNativePaymentLink(params: {
  recipientAddress: string
  tonAmount: number
  comment: string
}): string {
  const { recipientAddress, tonAmount, comment } = params
  const amountNano = tonToNano(tonAmount)

  // Tonkeeper deep link для нативного TON
  // https://app.tonkeeper.com/transfer/{address}?amount={nanoton}&text={comment}
  const url = new URL(`https://app.tonkeeper.com/transfer/${recipientAddress}`)
  url.searchParams.set('amount', amountNano.toString())
  url.searchParams.set('text', comment)

  return url.toString()
}

/**
 * Генерация ton:// deep link для нативного TON (работает во всех кошельках)
 */
export function generateTonNativeDeepLink(params: {
  recipientAddress: string
  tonAmount: number
  comment: string
}): string {
  const { recipientAddress, tonAmount, comment } = params
  const amountNano = tonToNano(tonAmount)

  // Универсальный ton:// deep link
  const url = new URL(`ton://transfer/${recipientAddress}`)
  url.searchParams.set('amount', amountNano.toString())
  url.searchParams.set('text', comment)

  return url.toString()
}
