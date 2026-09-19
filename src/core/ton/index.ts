/**
 * TON Blockchain API Client
 *
 * Клиент для работы с TON блокчейном через TON Center API
 * Поддержка проверки USDT Jetton транзакций
 */

import { Address, TonClient, JettonMaster, JettonWallet } from '@ton/ton'
import { parseJettonInternalTransfer } from './jettonBody'
import {
  readFromChain,
  chainWasUnreadable,
  TonChainUnreadable,
} from './chainRead'
import { getTonConfig, nanoToUsdt, nanoToTon, DECIMALS } from './config'
import { logger } from '@/utils/logger'

// Кэш клиента
let tonClient: TonClient | null = null

/**
 * Получить или создать TON клиент
 */
export async function getTonClient(): Promise<TonClient> {
  if (tonClient) {
    return tonClient
  }

  const config = getTonConfig()

  tonClient = new TonClient({
    endpoint: config.apiEndpoint,
    apiKey: config.apiKey,
  })

  logger.info('[TON] Client initialized', {
    network: config.network,
    endpoint: config.apiEndpoint,
  })

  return tonClient
}

/**
 * Получить адрес USDT кошелька пользователя
 *
 * Каждый владелец jetton имеет свой jetton wallet контракт
 * Этот адрес вычисляется из master контракта и адреса владельца
 */
export async function getJettonWalletAddress(
  ownerAddress: string,
  jettonMasterAddress?: string
): Promise<string> {
  try {
    const client = await getTonClient()
    const config = getTonConfig()

    const masterAddress = jettonMasterAddress || config.usdtMasterAddress
    const master = client.open(
      JettonMaster.create(Address.parse(masterAddress))
    )

    const jettonWalletAddress = await master.getWalletAddress(
      Address.parse(ownerAddress)
    )

    return jettonWalletAddress.toString()
  } catch (error) {
    logger.error('[TON] Error getting jetton wallet address', {
      ownerAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Интерфейс транзакции
 */
export interface TonTransaction {
  hash: string
  lt: string // logical time
  timestamp: number
  from: string
  to: string
  amount: bigint
  comment: string
  isIncoming: boolean
}

/**
 * Получить последние транзакции на адрес
 * Использует TON Center API напрямую для получения jetton транзакций
 */
export async function getJettonTransactions(
  walletAddress: string,
  limit: number = 20
): Promise<TonTransaction[]> {
  try {
    const config = getTonConfig()

    // Получаем адрес USDT jetton wallet для нашего кошелька
    const jettonWalletAddress = await getJettonWalletAddress(walletAddress)

    logger.info('[TON] Fetching jetton transactions', {
      walletAddress,
      jettonWalletAddress,
      limit,
    })

    /*
     * ARCHIVAL. A non-archival liteserver keeps only recent blocks, and
     * `getTransactions` has to walk back from the account's last transaction
     * to answer at all. Our wallet is quiet for months at a time, so that
     * last transaction ages out of the light node and EVERY call fails with
     *
     *   LITE_SERVER_UNKNOWN: cannot compute block with specified transaction:
     *   cannot find block (0,cf31229e66836b55) lt=94364624000001: lt not in db
     *
     * Reproduced against the live wallet on 2026-09-19, both ways, one after
     * the other: archival=false -> that exact error, 0 transactions;
     * archival=true -> ok, transactions returned. The same held for the native
     * twin below (block (0,5a558223fe27f617), lt=94364619000001).
     *
     * The cost was not the hourly page. `!data.ok` returns `[]`, so
     * `findPaymentByComment` searched an empty list and logged
     * transactionsCount=0 -- a paid invoice could not have been confirmed at
     * all, for as long as the wallet had been idle.
     */
    const url = `${config.apiEndpoint}/getTransactions?address=${jettonWalletAddress}&limit=${limit}&archival=true`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey
    }

    const data = await readFromChain(url, headers)

    const transactions: TonTransaction[] = []

    for (const tx of (data.result || []) as any[]) {
      // Парсим входящие сообщения (in_msg)
      if (tx.in_msg && tx.in_msg.source) {
        const comment = parseComment(tx.in_msg.msg_data)
        const amount = parseJettonAmount(tx)

        if (amount > 0) {
          transactions.push({
            hash: tx.transaction_id?.hash || tx.hash || '',
            lt: tx.transaction_id?.lt || tx.lt || '',
            timestamp: tx.utime || 0,
            from: tx.in_msg.source,
            to: walletAddress,
            amount: BigInt(amount),
            comment,
            isIncoming: true,
          })
        }
      }
    }

    logger.info('[TON] Found jetton transactions', {
      count: transactions.length,
      walletAddress,
    })

    return transactions
  } catch (error) {
    /*
     * A REFUSAL TRAVELS; ONLY A SUCCESSFUL READ MAY RETURN A LIST.
     *
     * This used to log and `return []` for everything, so a rate limit, a
     * timeout and `lt not in db` all arrived at the caller as the fact "no
     * jetton transfer ever came in" -- and the caller told the payer their
     * money was not on the chain. `getJettonWalletAddress` throwing lands
     * here too, and it is the same kind of failure: we could not look.
     */
    logger.warn('[TON] Could not read jetton transactions', {
      walletAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    throw chainWasUnreadable(error)
      ? error
      : new TonChainUnreadable(
          error instanceof Error ? error.message : String(error)
        )
  }
}

/**
 * Парсинг комментария из msg_data
 */
function parseComment(msgData: any): string {
  if (!msgData) return ''

  try {
    // text комментарий
    if (msgData['@type'] === 'msg.dataText' && msgData.text) {
      return Buffer.from(msgData.text, 'base64').toString('utf-8')
    }

    // A jetton internal_transfer body is a BoC; its memo lives in
    // forward_payload, not at a fixed byte offset. Try that first.
    if (msgData['@type'] === 'msg.dataRaw' && msgData.body) {
      const jetton = parseJettonInternalTransfer(msgData.body)
      if (jetton && jetton.comment) return jetton.comment
    }

    // raw данные - пробуем декодировать
    if (msgData['@type'] === 'msg.dataRaw' && msgData.body) {
      const body = Buffer.from(msgData.body, 'base64')
      // Первые 4 байта - operation code, остальное - данные
      if (body.length > 4) {
        const textPart = body.slice(4)
        const text = textPart.toString('utf-8').replace(/\0/g, '')
        if (text && /^[\x20-\x7E]+$/.test(text)) {
          return text
        }
      }
    }
  } catch {
    // Ignore parsing errors
  }

  return ''
}

/**
 * Jetton amount of an incoming transfer in RAW jetton units (USDT: 6 decimals),
 * as getJettonTransactions expects (it wraps the value in BigInt and
 * findPaymentByComment converts with nanoToUsdt). 0 when the body is not a
 * parseable internal_transfer. Exact up to 2^53 raw units (~9e9 USDT).
 */
function parseJettonAmount(tx: any): number {
  const body = tx?.in_msg?.msg_data?.body
  if (!body) return 0
  const parsed = parseJettonInternalTransfer(body)
  return parsed ? Number(parsed.amount) : 0
}

/**
 * Найти платёж по комментарию (invoice ID)
 */
/**
 * expectedAmountUsdt is REQUIRED, and that is the point.
 *
 * It used to be optional, so the amount comparison below sat behind
 * `if (expectedAmountUsdt !== undefined)` and a caller that omitted it got a
 * transaction matched on the COMMENT ALONE -- credited for whatever the
 * invoice said, regardless of what actually arrived on chain. Both callers
 * pass it today, so requiring it changes no behaviour; it changes omission
 * from a silent skip into a compile error.
 */
export async function findPaymentByComment(
  walletAddress: string,
  expectedComment: string,
  expectedAmountUsdt: number,
  sinceTimestamp?: number
): Promise<TonTransaction | null> {
  try {
    const transactions = await getJettonTransactions(walletAddress, 50)

    logger.info('[TON] Searching for payment', {
      expectedComment,
      expectedAmountUsdt,
      sinceTimestamp,
      transactionsCount: transactions.length,
    })

    for (const tx of transactions) {
      // Проверяем timestamp
      if (sinceTimestamp && tx.timestamp < sinceTimestamp) {
        continue
      }

      // Проверяем комментарий
      if (tx.comment !== expectedComment) {
        continue
      }

      // Проверяем сумму (если указана)
      if (expectedAmountUsdt !== undefined) {
        const receivedUsdt = nanoToUsdt(tx.amount)
        // Допускаем небольшую погрешность из-за комиссий
        if (receivedUsdt < expectedAmountUsdt * 0.99) {
          logger.warn('[TON] Amount mismatch', {
            expected: expectedAmountUsdt,
            received: receivedUsdt,
            comment: tx.comment,
          })
          continue
        }
      }

      logger.info('[TON] Payment found!', {
        hash: tx.hash,
        amount: nanoToUsdt(tx.amount),
        comment: tx.comment,
        from: tx.from,
      })

      return tx
    }

    return null
  } catch (error) {
    /*
     * `null` here means "searched, and this invoice was not paid". A read
     * that never happened has not earned that answer, so it travels on and
     * the caller decides what to tell the payer.
     */
    if (chainWasUnreadable(error)) throw error
    logger.error('[TON] Error finding payment', {
      expectedComment,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Проверить, была ли транзакция уже обработана
 * (по tx_hash в базе данных)
 */
export async function isTransactionProcessed(txHash: string): Promise<boolean> {
  try {
    const { supabase } = await import('@/core/supabase')

    const { data } = await supabase
      .from('payments_v2')
      .select('id')
      .eq('metadata->ton_tx_hash', txHash)
      .limit(1)

    return (data?.length || 0) > 0
  } catch (error) {
    logger.error('[TON] Error checking if transaction processed', {
      txHash,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Получить баланс USDT на кошельке
 */
export async function getUsdtBalance(walletAddress: string): Promise<number> {
  try {
    const client = await getTonClient()
    const config = getTonConfig()

    // Получаем адрес jetton wallet
    const jettonWalletAddress = await getJettonWalletAddress(walletAddress)

    // Открываем jetton wallet контракт
    const jettonWallet = client.open(
      JettonWallet.create(Address.parse(jettonWalletAddress))
    )

    // Получаем баланс
    const balance = await jettonWallet.getBalance()

    return nanoToUsdt(balance)
  } catch (error) {
    logger.error('[TON] Error getting USDT balance', {
      walletAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

/**
 * Получить нативные TON транзакции на адрес
 * Проще чем Jetton - работаем напрямую с кошельком
 */
export async function getNativeTransactions(
  walletAddress: string,
  limit: number = 20
): Promise<TonTransaction[]> {
  try {
    const config = getTonConfig()

    logger.info('[TON] Fetching native TON transactions', {
      walletAddress,
      limit,
    })

    // Archival for the same reason as the jetton twin above: an idle wallet's
    // last transaction is not in a light node's database, and without it this
    // endpoint cannot answer at all.
    const url = `${config.apiEndpoint}/getTransactions?address=${walletAddress}&limit=${limit}&archival=true`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey
    }

    const data = await readFromChain(url, headers)

    const transactions: TonTransaction[] = []

    for (const tx of (data.result || []) as any[]) {
      // Парсим входящие сообщения (in_msg) для нативного TON
      if (tx.in_msg && tx.in_msg.source && tx.in_msg.value) {
        const comment = parseComment(tx.in_msg.msg_data)
        const amount = BigInt(tx.in_msg.value || '0')

        if (amount > 0n) {
          transactions.push({
            hash: tx.transaction_id?.hash || tx.hash || '',
            lt: tx.transaction_id?.lt || tx.lt || '',
            timestamp: tx.utime || 0,
            from: tx.in_msg.source,
            to: walletAddress,
            amount,
            comment,
            isIncoming: true,
          })
        }
      }
    }

    logger.info('[TON] Found native TON transactions', {
      count: transactions.length,
      walletAddress,
    })

    return transactions
  } catch (error) {
    // Same rule as the jetton twin: an empty list is a statement about the
    // chain, and only a read that succeeded is entitled to make it.
    logger.warn('[TON] Could not read native transactions', {
      walletAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    throw chainWasUnreadable(error)
      ? error
      : new TonChainUnreadable(
          error instanceof Error ? error.message : String(error)
        )
  }
}

/**
 * Найти нативный TON платёж по комментарию (invoice ID)
 */
/**
 * expectedAmountTon is REQUIRED, for the same reason as the USDT twin above:
 * an optional amount makes the on-chain check opt-in, and a caller that
 * forgets it credits on a comment match alone.
 */
export async function findNativePaymentByComment(
  walletAddress: string,
  expectedComment: string,
  expectedAmountTon: number,
  sinceTimestamp?: number
): Promise<TonTransaction | null> {
  try {
    const transactions = await getNativeTransactions(walletAddress, 50)

    logger.info('[TON] Searching for native TON payment', {
      expectedComment,
      expectedAmountTon,
      sinceTimestamp,
      transactionsCount: transactions.length,
    })

    for (const tx of transactions) {
      // Проверяем timestamp
      if (sinceTimestamp && tx.timestamp < sinceTimestamp) {
        continue
      }

      // Проверяем комментарий
      if (tx.comment !== expectedComment) {
        continue
      }

      // Проверяем сумму (если указана)
      if (expectedAmountTon !== undefined) {
        const receivedTon = nanoToTon(tx.amount)
        // Допускаем небольшую погрешность из-за комиссий
        if (receivedTon < expectedAmountTon * 0.99) {
          logger.warn('[TON] Native TON amount mismatch', {
            expected: expectedAmountTon,
            received: receivedTon,
            comment: tx.comment,
          })
          continue
        }
      }

      logger.info('[TON] Native TON payment found!', {
        hash: tx.hash,
        amount: nanoToTon(tx.amount),
        comment: tx.comment,
        from: tx.from,
      })

      return tx
    }

    return null
  } catch (error) {
    // As above: "not paid" is a finding, and an unreadable chain has none.
    if (chainWasUnreadable(error)) throw error
    logger.error('[TON] Error finding native TON payment', {
      expectedComment,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Получить баланс нативного TON на кошельке
 */
export async function getTonBalance(walletAddress: string): Promise<number> {
  try {
    const client = await getTonClient()

    const balance = await client.getBalance(Address.parse(walletAddress))

    return nanoToTon(balance)
  } catch (error) {
    logger.error('[TON] Error getting TON balance', {
      walletAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

// Re-export config functions
export {
  getTonConfig,
  usdtToNano,
  nanoToUsdt,
  tonToNano,
  nanoToTon,
} from './config'
export {
  generateTonPaymentLink,
  generateTonkeeperLink,
  generateTonNativePaymentLink,
  generateTonNativeDeepLink,
  USDT_MASTER_ADDRESS,
  PAYMENT_CHECK,
} from './config'
