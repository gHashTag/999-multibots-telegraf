/**
 * x402 Payment Routes
 *
 * Handles USDC payments on Base network using the x402 protocol.
 * https://www.x402.org/
 *
 * Endpoints:
 * - GET /api/x402-topup - Returns 402 Payment Required with payment details
 * - POST /api/x402-payment - Handles payment verification after x402 flow
 */

import { Router, Request, Response } from 'express'
import { redactSensitiveHeaders } from '@/utils/redactHeaders'
import { paymentMiddleware } from 'x402-express'
import { logger } from '@/utils/logger'
import {
  getX402Config,
  isX402Configured,
  logX402Event,
  getUsdcContractAddress,
  getChainId,
} from '@/core/x402'
import {
  getPaymentByInvId,
  updatePaymentStatus,
} from '@/core/supabase/payments'
import { updateUserBalance } from '@/core/supabase'
import {
  PaymentStatus,
  PaymentType,
  PaymentMethod,
} from '@/interfaces/payments.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

const router = Router()

// Store bot instance for sending notifications
let botInstance: Telegraf<MyContext> | null = null

export function setX402BotInstance(bot: Telegraf<MyContext>): void {
  botInstance = bot
  logger.info('[x402] Bot instance set for notifications')
}

/**
 * x402 Top-up endpoint
 *
 * This endpoint is protected by x402 middleware.
 * When accessed without payment:
 * - Returns HTTP 402 Payment Required
 * - Client signs USDC transfer
 * - Resends request with X-PAYMENT header
 * - Middleware verifies payment
 * - Request proceeds to handler
 */
router.get(
  '/x402-topup',
  async (req: Request, res: Response): Promise<void> => {
    const { inv_id, telegram_id, amount, stars } = req.query

    logger.info('[x402] Top-up request received', {
      inv_id,
      telegram_id,
      amount,
      stars,
      headers: redactSensitiveHeaders(req.headers),
    })

    // Validate required parameters
    if (!inv_id || !telegram_id || !amount || !stars) {
      res.status(400).json({
        error: 'Missing required parameters',
        required: ['inv_id', 'telegram_id', 'amount', 'stars'],
      })
      return
    }

    // Check if x402 is configured
    if (!isX402Configured()) {
      res.status(503).json({
        error: 'x402 payment not configured',
      })
      return
    }

    const config = getX402Config()
    const amountUsd = parseFloat(amount as string)
    const starsAmount = parseInt(stars as string, 10)

    // Check for X-PAYMENT header (indicates payment was made)
    const paymentHeader = req.headers['x-payment'] as string | undefined

    if (paymentHeader) {
      // Payment was made - process it
      try {
        logX402Event('Payment header received', {
          inv_id,
          telegram_id,
          amount: amountUsd,
          stars: starsAmount,
        })

        // ЗАЧИСЛЕНИЕ ЗАКРЫТО, ПОКА НЕТ ПРОВЕРКИ ПЛАТЕЖА.
        //
        // Ниже стояло зачисление баланса, у которого единственной защитой было
        // НАЛИЧИЕ заголовка X-PAYMENT — его содержимое не проверялось ничем.
        // При этом telegram_id и stars брались из СТРОКИ ЗАПРОСА, то есть их
        // задаёт вызывающий. Любой человек с любым pending inv_id мог написать
        //
        //   GET /api/x402-topup?inv_id=…&telegram_id=<чужой>&stars=999999
        //   X-PAYMENT: что угодно
        //
        // и получить эти звёзды на любой аккаунт.
        //
        // Сейчас роутер НЕ ПРИМОНТИРОВАН (в api_server/index.ts нет app.use для
        // x402Router), и это единственное, что мешало. Полагаться на забытую
        // строку нельзя: кто-нибудь её допишет, увидев неработающую оплату.
        //
        // Настоящей проверки в проекте нет. `validatePaymentHeader` в
        // core/x402/index.ts существует, но НЕ ВЫЗЫВАЕТСЯ ни разу и всё равно
        // проверяет лишь наличие четырёх полей, а не подпись. Сверки с
        // facilitator'ом (settle/verify) нет вовсе.
        //
        // Поэтому отказываем явно. Чтобы включить: сверить платёж с
        // facilitator'ом по сети И брать сумму со звёздами из строки payments_v2,
        // а не из запроса.
        logger.error(
          '[x402] Зачисление отклонено: проверки платежа не существует',
          {
            inv_id,
            telegram_id_from_query: telegram_id,
            stars_from_query: starsAmount,
          }
        )
        res.status(501).json({
          error: 'x402 settlement verification is not implemented',
          detail:
            'Balance crediting is disabled until the X-PAYMENT header is verified ' +
            'against the facilitator and the amount is read from the payment record.',
        })
        return

        // Verify payment exists in database
        // eslint-disable-next-line no-unreachable
        const { data: payment, error: paymentError } = await getPaymentByInvId(
          inv_id as string
        )
        if (paymentError || !payment) {
          res.status(404).json({ error: 'Payment not found' })
          return
        }

        if (payment.status === PaymentStatus.COMPLETED) {
          res.status(200).json({
            success: true,
            message: 'Payment already processed',
            stars: starsAmount,
          })
          return
        }

        /*
         * Update payment status to COMPLETED -- WHICH IS ITSELF THE CREDIT.
         *
         * The balance is a filtered sum over COMPLETED rows, so this flip moves
         * money without naming an amount. It answers {data, error} and reports
         * "not found" instead of throwing, so a discarded result cannot tell a
         * credited person from an untouched row. Dead code today (the early
         * return above), bound anyway: this route is waiting to be switched on
         * the day the X-PAYMENT header is verified, and a sketch is what a
         * future edit revives.
         */
        const marked = await updatePaymentStatus(
          inv_id as string,
          PaymentStatus.COMPLETED
        )
        if (marked.error) {
          logger.error(
            '❌ [x402] payment not marked completed -- not crediting',
            {
              inv_id,
              error: marked.error.message,
            }
          )
          res.status(500).json({ error: 'payment could not be completed' })
          return
        }

        // Credit user balance.
        //
        // The result is CHECKED, not discarded. updateUserBalance returns false
        // WITHOUT throwing when the payer row is missing or the insert fails,
        // and the old code logged 'Payment completed' regardless: someone paid
        // real USDC, the stars may never have arrived, and the only record said
        // it went fine.
        const credited = await updateUserBalance(
          telegram_id as string,
          starsAmount,
          PaymentType.MONEY_INCOME,
          `x402 top-up: ${amountUsd} USDC`,
          {
            inv_id: inv_id as string,
            amount_usd: amountUsd,
            payment_method: PaymentMethod.X402,
            network: config.network,
          }
        )

        if (!credited) {
          logX402Event('PAID BUT NOT CREDITED', {
            inv_id,
            telegram_id,
            amount: amountUsd,
            stars: starsAmount,
            alert: 'user paid USDC and the stars were not added',
          })
        }

        logX402Event(credited ? 'Payment completed' : 'Payment NOT credited', {
          inv_id,
          telegram_id,
          amount: amountUsd,
          stars: starsAmount,
        })

        // Send notification to user
        if (botInstance) {
          try {
            const telegramIdNum = parseInt(telegram_id as string, 10)
            await botInstance.telegram.sendMessage(
              telegramIdNum,
              `✅ Баланс пополнен!\n\n` +
                `💰 Сумма: $${amountUsd} USDC\n` +
                `⭐️ Получено: ${starsAmount} звезд\n\n` +
                `Спасибо за покупку! / Thank you for your purchase!`
            )
          } catch (notifyError) {
            logger.error('[x402] Failed to send notification', {
              error:
                notifyError instanceof Error
                  ? notifyError.message
                  : String(notifyError),
              telegram_id,
            })
          }
        }

        // Return success page
        res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Successful</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .card {
              background: white;
              border-radius: 16px;
              padding: 40px;
              text-align: center;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              max-width: 400px;
            }
            .success-icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 { color: #333; margin-bottom: 16px; }
            p { color: #666; line-height: 1.6; }
            .amount { font-size: 24px; color: #4CAF50; font-weight: bold; }
            .stars { font-size: 20px; color: #FF9800; }
            .back-link {
              display: inline-block;
              margin-top: 24px;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success-icon">✅</div>
            <h1>Payment Successful!</h1>
            <p class="amount">$${amountUsd} USDC</p>
            <p class="stars">+${starsAmount} ⭐️ stars</p>
            <p>Your balance has been updated.</p>
            <a href="https://t.me/" class="back-link">Return to Telegram</a>
          </div>
        </body>
        </html>
      `)
      } catch (error) {
        logger.error('[x402] Error processing payment', {
          error: error instanceof Error ? error.message : String(error),
          inv_id,
          telegram_id,
        })
        res.status(500).json({ error: 'Payment processing failed' })
      }
    } else {
      // No payment yet - show payment page with wallet connect
      const networkName =
        config.network === 'base-mainnet' ? 'Base' : 'Base Sepolia'
      const chainId = getChainId(config.network)
      const usdcContract = getUsdcContractAddress(config.network)
      const amountWei = (amountUsd * 1e6).toString() // USDC has 6 decimals

      // Return HTML payment page - Black & Yellow Design with i18n
      res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>USDC Payment | x402</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-height: 100vh;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
          }
          .card {
            background: #111;
            border: 2px solid #FFD700;
            border-radius: 20px;
            padding: 40px;
            max-width: 420px;
            width: 100%;
            box-shadow: 0 0 60px rgba(255,215,0,0.15);
          }
          .logo {
            text-align: center;
            margin-bottom: 24px;
          }
          .logo-icon {
            font-size: 56px;
            margin-bottom: 8px;
          }
          .logo-text {
            font-size: 12px;
            color: #FFD700;
            text-transform: uppercase;
            letter-spacing: 4px;
            font-weight: 600;
          }
          h1 {
            text-align: center;
            color: #FFD700;
            font-size: 28px;
            margin-bottom: 8px;
            font-weight: 700;
          }
          .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 32px;
            font-size: 14px;
          }
          .amount-box {
            background: linear-gradient(135deg, #1a1a00 0%, #332900 100%);
            border: 1px solid #FFD700;
            border-radius: 16px;
            padding: 28px;
            text-align: center;
            margin-bottom: 24px;
          }
          .amount {
            font-size: 56px;
            font-weight: 800;
            color: #FFD700;
            text-shadow: 0 0 20px rgba(255,215,0,0.5);
          }
          .currency {
            font-size: 18px;
            color: #FFF;
            font-weight: 500;
            margin-top: 4px;
          }
          .stars {
            font-size: 20px;
            color: #FFD700;
            margin-top: 12px;
            font-weight: 600;
          }
          .info {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #333;
          }
          .info-row:last-child { border-bottom: none; }
          .info-label { color: #888; font-size: 14px; }
          .info-value { color: #FFD700; font-weight: 600; font-size: 14px; }
          .btn {
            width: 100%;
            padding: 18px 24px;
            font-size: 16px;
            font-weight: 700;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .btn-primary {
            background: #FFD700;
            color: #000;
          }
          .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(255,215,0,0.4);
            background: #FFE44D;
          }
          .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
          .btn-secondary {
            background: transparent;
            border: 1px solid #444;
            color: #888;
            margin-top: 12px;
            text-decoration: none;
          }
          .btn-secondary:hover { border-color: #FFD700; color: #FFD700; }
          .status {
            text-align: center;
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 16px;
            display: none;
            font-weight: 500;
          }
          .status.error { background: #330000; border: 1px solid #ff4444; color: #ff6666; display: block; }
          .status.success { background: #003300; border: 1px solid #44ff44; color: #66ff66; display: block; }
          .status.loading { background: #1a1a00; border: 1px solid #FFD700; color: #FFD700; display: block; }
          .spinner {
            display: inline-block;
            width: 18px;
            height: 18px;
            border: 2px solid rgba(0,0,0,0.3);
            border-radius: 50%;
            border-top-color: #000;
            animation: spin 1s linear infinite;
            margin-right: 8px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .testnet-badge {
            background: #332200;
            border: 1px solid #FF8C00;
            color: #FF8C00;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 20px;
            text-align: center;
          }
          .testnet-badge a { color: #FFD700; text-decoration: underline; }
          .wallet-info {
            font-size: 11px;
            color: #555;
            text-align: center;
            margin-top: 20px;
          }
          .footer {
            text-align: center;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #222;
          }
          .footer-text {
            font-size: 11px;
            color: #444;
          }
          .powered-by {
            font-size: 10px;
            color: #FFD700;
            margin-top: 8px;
            letter-spacing: 2px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">
            <div class="logo-icon">💎</div>
            <div class="logo-text" data-i18n="cryptoPayment">Crypto Payment</div>
          </div>

          <h1 data-i18n="topUpBalance">Top Up Balance</h1>
          <p class="subtitle" data-i18n="payWithUsdc">Pay with USDC on ${networkName}</p>

          <div class="amount-box">
            <div class="amount">$${amountUsd}</div>
            <div class="currency">USDC</div>
            <div class="stars">+${starsAmount} <span data-i18n="stars">Stars</span></div>
          </div>

          ${
            config.network === 'base-sepolia'
              ? `
          <div class="testnet-badge">
            <span data-i18n="testnetMode">TESTNET MODE</span> — Base Sepolia<br>
            <a href="https://faucet.circle.com/" target="_blank" data-i18n="getTestUsdc">Get free test USDC</a>
          </div>
          `
              : ''
          }

          <div class="info">
            <div class="info-row">
              <span class="info-label" data-i18n="network">Network</span>
              <span class="info-value">${networkName}</span>
            </div>
            <div class="info-row">
              <span class="info-label" data-i18n="token">Token</span>
              <span class="info-value">USDC</span>
            </div>
            <div class="info-row">
              <span class="info-label" data-i18n="recipient">Recipient</span>
              <span class="info-value">${config.walletAddress.slice(0, 6)}...${config.walletAddress.slice(-4)}</span>
            </div>
          </div>

          <div id="status" class="status"></div>

          <button id="connectBtn" class="btn btn-primary" onclick="connectWallet()">
            <span data-i18n="connectWallet">Connect Wallet</span>
          </button>

          <button id="payBtn" class="btn btn-primary" style="display: none;" onclick="sendPayment()">
            <span data-i18n="payAmount">Pay</span> $${amountUsd} USDC
          </button>

          <a href="https://t.me/" class="btn btn-secondary" data-i18n="backToTelegram">Back to Telegram</a>

          <p class="wallet-info" data-i18n="walletSupport">
            Supports: MetaMask, Coinbase Wallet, Trust Wallet, Rainbow
          </p>

          <div class="footer">
            <div class="footer-text" data-i18n="instantSettlement">Instant settlement - Zero fees - Secure</div>
            <div class="powered-by">POWERED BY X402</div>
          </div>
        </div>

        <script>
          // i18n translations
          const translations = {
            ru: {
              cryptoPayment: 'Крипто-оплата',
              topUpBalance: 'Пополнить баланс',
              payWithUsdc: 'Оплата USDC в сети ${networkName}',
              stars: 'Звёзд',
              testnetMode: 'ТЕСТОВЫЙ РЕЖИМ',
              getTestUsdc: 'Получить тестовые USDC',
              network: 'Сеть',
              token: 'Токен',
              recipient: 'Получатель',
              connectWallet: 'Подключить кошелёк',
              payAmount: 'Оплатить',
              backToTelegram: '← Назад в Telegram',
              walletSupport: 'Поддержка: MetaMask, Coinbase Wallet, Trust Wallet, Rainbow',
              instantSettlement: 'Мгновенное зачисление • Без комиссии • Безопасно',
              // Status messages
              walletNotFound: 'Кошелёк не найден. Установите MetaMask или Coinbase Wallet.',
              connecting: 'Подключение...',
              connectingToWallet: 'Подключение к кошельку...',
              switchingNetwork: 'Переключение на ${networkName}...',
              walletConnected: 'Кошелёк подключен',
              errorColon: 'Ошибка',
              connectionFailed: 'Не удалось подключиться',
              sending: 'Отправка...',
              preparingTx: 'Подготовка транзакции...',
              confirmInWallet: 'Подтвердите транзакцию в кошельке...',
              txSent: 'Транзакция отправлена. Ожидание подтверждения...',
              paymentSuccess: 'Оплата успешна! Баланс пополнен на',
              paid: 'Оплачено',
              txRejected: 'Транзакция отклонена пользователем',
              insufficientFunds: 'Недостаточно USDC или ETH для газа',
              sendFailed: 'Не удалось отправить'
            },
            en: {
              cryptoPayment: 'Crypto Payment',
              topUpBalance: 'Top Up Balance',
              payWithUsdc: 'Pay with USDC on ${networkName}',
              stars: 'Stars',
              testnetMode: 'TESTNET MODE',
              getTestUsdc: 'Get free test USDC',
              network: 'Network',
              token: 'Token',
              recipient: 'Recipient',
              connectWallet: 'Connect Wallet',
              payAmount: 'Pay',
              backToTelegram: '← Back to Telegram',
              walletSupport: 'Supports: MetaMask, Coinbase Wallet, Trust Wallet, Rainbow',
              instantSettlement: 'Instant settlement - Zero fees - Secure',
              // Status messages
              walletNotFound: 'Wallet not found. Install MetaMask or Coinbase Wallet.',
              connecting: 'Connecting...',
              connectingToWallet: 'Connecting to wallet...',
              switchingNetwork: 'Switching to ${networkName}...',
              walletConnected: 'Wallet connected',
              errorColon: 'Error',
              connectionFailed: 'Connection failed',
              sending: 'Sending...',
              preparingTx: 'Preparing transaction...',
              confirmInWallet: 'Confirm transaction in wallet...',
              txSent: 'Transaction sent. Waiting for confirmation...',
              paymentSuccess: 'Payment successful! Balance topped up by',
              paid: 'Paid',
              txRejected: 'Transaction rejected by user',
              insufficientFunds: 'Insufficient USDC or ETH for gas',
              sendFailed: 'Failed to send'
            }
          };

          // Detect browser language
          const browserLang = navigator.language || navigator.userLanguage;
          const isRu = browserLang.toLowerCase().startsWith('ru');
          const lang = isRu ? 'ru' : 'en';
          const t = translations[lang];

          // Apply translations to DOM
          document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) {
              el.textContent = t[key];
            }
          });

          // Update document language
          document.documentElement.lang = lang;

          const CHAIN_ID = ${chainId};
          const CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16);
          const USDC_CONTRACT = '${usdcContract}';
          const RECIPIENT = '${config.walletAddress}';
          const AMOUNT = '${amountWei}'; // in USDC smallest units (6 decimals)
          const INV_ID = '${inv_id}';
          const TELEGRAM_ID = '${telegram_id}';
          const STARS = ${starsAmount};
          const AMOUNT_USD = ${amountUsd};
          const NETWORK_NAME = '${networkName}';

          let userAddress = null;
          let provider = null;

          function showStatus(message, type) {
            const status = document.getElementById('status');
            status.className = 'status ' + type;
            status.innerHTML = message;
          }

          async function connectWallet() {
            const connectBtn = document.getElementById('connectBtn');
            const payBtn = document.getElementById('payBtn');

            if (typeof window.ethereum === 'undefined') {
              showStatus('❌ ' + t.walletNotFound, 'error');
              return;
            }

            try {
              connectBtn.disabled = true;
              connectBtn.innerHTML = '<span class="spinner"></span> ' + t.connecting;
              showStatus('🔄 ' + t.connectingToWallet, 'loading');

              // Request accounts
              const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
              });

              if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
              }

              userAddress = accounts[0];
              provider = window.ethereum;

              // Check network
              const chainId = await window.ethereum.request({ method: 'eth_chainId' });

              if (chainId !== CHAIN_ID_HEX) {
                showStatus('🔄 ' + t.switchingNetwork.replace('\${networkName}', NETWORK_NAME), 'loading');

                try {
                  await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: CHAIN_ID_HEX }]
                  });
                } catch (switchError) {
                  // Chain not added, try to add it
                  if (switchError.code === 4902) {
                    await window.ethereum.request({
                      method: 'wallet_addEthereumChain',
                      params: [{
                        chainId: CHAIN_ID_HEX,
                        chainName: NETWORK_NAME,
                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                        rpcUrls: ['${config.network === 'base-mainnet' ? 'https://mainnet.base.org' : 'https://sepolia.base.org'}'],
                        blockExplorerUrls: ['${config.network === 'base-mainnet' ? 'https://basescan.org' : 'https://sepolia.basescan.org'}']
                      }]
                    });
                  } else {
                    throw switchError;
                  }
                }
              }

              // Show connected state
              showStatus('✅ ' + t.walletConnected + ': ' + userAddress.slice(0,6) + '...' + userAddress.slice(-4), 'success');
              connectBtn.style.display = 'none';
              payBtn.style.display = 'flex';

            } catch (error) {
              console.error('Connect error:', error);
              showStatus('❌ ' + t.errorColon + ': ' + (error.message || t.connectionFailed), 'error');
              connectBtn.disabled = false;
              connectBtn.innerHTML = '🔗 ' + t.connectWallet;
            }
          }

          async function sendPayment() {
            const payBtn = document.getElementById('payBtn');

            try {
              payBtn.disabled = true;
              payBtn.innerHTML = '<span class="spinner"></span> ' + t.sending;
              showStatus('🔄 ' + t.preparingTx, 'loading');

              // ERC20 transfer function signature
              const transferFunctionSignature = '0xa9059cbb';

              // Encode recipient address (32 bytes, padded)
              const encodedRecipient = RECIPIENT.slice(2).toLowerCase().padStart(64, '0');

              // Encode amount (32 bytes, padded)
              const encodedAmount = BigInt(AMOUNT).toString(16).padStart(64, '0');

              // Combine to create data
              const data = transferFunctionSignature + encodedRecipient + encodedAmount;

              showStatus('🔄 ' + t.confirmInWallet, 'loading');

              // Send transaction
              const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                  from: userAddress,
                  to: USDC_CONTRACT,
                  data: data,
                  gas: '0x' + (100000).toString(16) // 100k gas limit
                }]
              });

              showStatus('🔄 ' + t.txSent, 'loading');

              // Notify server about payment
              const response = await fetch('/api/x402-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  inv_id: INV_ID,
                  telegram_id: TELEGRAM_ID,
                  amount: AMOUNT_USD,
                  stars: STARS,
                  transaction_hash: txHash
                })
              });

              const result = await response.json();

              if (result.success) {
                showStatus('✅ ' + t.paymentSuccess + ' ' + STARS + ' ⭐️', 'success');
                payBtn.innerHTML = '✅ ' + t.paid;
                payBtn.disabled = true;

                // Redirect after delay
                setTimeout(() => {
                  window.location.href = 'https://t.me/';
                }, 3000);
              } else {
                throw new Error(result.error || 'Payment verification failed');
              }

            } catch (error) {
              console.error('Payment error:', error);

              if (error.code === 4001) {
                showStatus('❌ ' + t.txRejected, 'error');
              } else if (error.code === -32603) {
                showStatus('❌ ' + t.insufficientFunds, 'error');
              } else {
                showStatus('❌ ' + t.errorColon + ': ' + (error.message || t.sendFailed), 'error');
              }

              payBtn.disabled = false;
              payBtn.innerHTML = '💰 ' + t.payAmount + ' $' + AMOUNT_USD + ' USDC';
            }
          }

          // Check if already connected
          if (typeof window.ethereum !== 'undefined') {
            window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
              if (accounts && accounts.length > 0) {
                userAddress = accounts[0];
                document.getElementById('connectBtn').style.display = 'none';
                document.getElementById('payBtn').style.display = 'flex';
                showStatus('✅ ' + t.walletConnected + ': ' + userAddress.slice(0,6) + '...' + userAddress.slice(-4), 'success');
              }
            });
          }
        </script>
      </body>
      </html>
    `)
    }
  }
)

/**
 * x402 Payment Callback (alternative verification endpoint)
 *
 * Some x402 clients may POST payment proof here instead of resending GET
 */
router.post(
  '/x402-payment',
  async (req: Request, res: Response): Promise<void> => {
    const { inv_id, telegram_id, amount, stars, transaction_hash } = req.body

    logger.info('[x402] Payment callback received', {
      inv_id,
      telegram_id,
      amount,
      stars,
      transaction_hash,
    })

    if (!inv_id || !telegram_id) {
      res.status(400).json({ error: 'Missing required parameters' })
      return
    }

    // Fail closed, exactly like the GET /x402-topup handler above. There is NO
    // settlement verification in this project: telegram_id and stars are taken
    // from the request body, and transaction_hash is only logged, never checked
    // on-chain or against the facilitator (settle/verify). Crediting here would
    // let anyone who knows a pending inv_id POST { telegram_id, stars } and mint
    // balance to any account for any amount. Refuse until settlement is
    // implemented AND the amount is read from the payments_v2 record, not the
    // request. The unverified body below is kept only as a reference impl.
    logger.error(
      '[x402] Callback crediting rejected: no payment verification exists',
      {
        inv_id,
        telegram_id_from_body: telegram_id,
        stars_from_body: stars,
      }
    )
    res.status(501).json({
      error: 'x402 settlement verification is not implemented',
      detail:
        'Balance crediting is disabled until the X-PAYMENT header is verified ' +
        'against the facilitator and the amount is read from the payment record.',
    })
    return

    // eslint-disable-next-line no-unreachable
    try {
      // Verify payment exists
      const { data: payment, error: paymentError } =
        await getPaymentByInvId(inv_id)
      if (paymentError || !payment) {
        res.status(404).json({ error: 'Payment not found' })
        return
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        res.status(200).json({
          success: true,
          message: 'Payment already processed',
        })
        return
      }

      const config = getX402Config()
      const starsAmount = parseInt(stars, 10) || (payment as any).stars
      const amountUsd = parseFloat(amount) || (payment as any).amount

      // Update payment status -- the same credit-in-disguise as the route
      // above, and bound for the same reason.
      const marked = await updatePaymentStatus(inv_id, PaymentStatus.COMPLETED)
      if (marked.error) {
        logger.error(
          '❌ [x402] payment not marked completed -- not crediting',
          {
            inv_id,
            error: marked.error.message,
          }
        )
        res.status(500).json({ error: 'payment could not be completed' })
        return
      }

      // Credit user balance. Same as the route above: a discarded result meant
      // the callback reported success whether or not the stars arrived.
      const credited = await updateUserBalance(
        telegram_id,
        starsAmount,
        PaymentType.MONEY_INCOME,
        `x402 top-up: ${amountUsd} USDC`,
        {
          inv_id,
          amount_usd: amountUsd,
          transaction_hash,
          payment_method: PaymentMethod.X402,
          network: config.network,
        }
      )

      if (!credited) {
        logX402Event('PAID BUT NOT CREDITED', {
          inv_id,
          telegram_id,
          amount: amountUsd,
          stars: starsAmount,
          transaction_hash,
          alert: 'user paid USDC and the stars were not added',
        })
      }

      logX402Event(
        credited ? 'Payment callback processed' : 'Callback NOT credited',
        {
          inv_id,
          telegram_id,
          amount: amountUsd,
          stars: starsAmount,
          transaction_hash,
        }
      )

      // Send notification
      if (botInstance) {
        try {
          await botInstance.telegram.sendMessage(
            parseInt(telegram_id, 10),
            `✅ Баланс пополнен!\n\n` +
              `💰 Сумма: $${amountUsd} USDC\n` +
              `⭐️ Получено: ${starsAmount} звезд\n\n` +
              `Спасибо за покупку! / Thank you for your purchase!`
          )
        } catch (notifyError) {
          logger.error('[x402] Failed to send notification', {
            error:
              notifyError instanceof Error
                ? notifyError.message
                : String(notifyError),
            telegram_id,
          })
        }
      }

      res.status(200).json({
        success: true,
        message: 'Payment processed successfully',
        stars: starsAmount,
      })
    } catch (error) {
      logger.error('[x402] Error in payment callback', {
        error: error instanceof Error ? error.message : String(error),
        inv_id,
      })
      res.status(500).json({ error: 'Payment processing failed' })
    }
  }
)

/**
 * x402 Status endpoint - check if x402 is configured
 */
router.get('/x402-status', (req: Request, res: Response): void => {
  const config = getX402Config()
  const configured = isX402Configured()

  res.json({
    configured,
    network: config.network,
    facilitator: config.facilitatorUrl,
    walletConfigured: !!config.walletAddress,
    chainId: getChainId(config.network),
    usdcContract: getUsdcContractAddress(config.network),
  })
})

export default router
