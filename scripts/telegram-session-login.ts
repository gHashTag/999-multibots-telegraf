/**
 * РАЗОВЫЙ ВХОД В TELEGRAM, ЧТОБЫ У АГЕНТА ПОЯВИЛСЯ ДОСТУП К ПЕРЕПИСКЕ.
 *
 * Запускает владелец, на своей машине:
 *
 *     npx tsx scripts/telegram-session-login.ts
 *
 * Скрипт спросит телефон, код из Telegram и пароль 2FA (если включён), и
 * напечатает строку сессии. Её нужно положить в переменную
 * TELEGRAM_SESSION_STRING сервиса **vibee-render**.
 *
 * ── ПОЧЕМУ ЭТО ДЕЛАЕТ ЧЕЛОВЕК, А НЕ АГЕНТ ───────────────────────────────────
 *
 * Всё остальное в этой задаче агент сделал сам: инструменты (tg_dialogs,
 * tg_history, tg_search, tg_contacts и три действующих) написаны, подключены
 * к реестру и отвечают в проде — проверено вызовом. Не хватает ровно одного:
 * действительного входа.
 *
 * Код из Telegram — учётные данные человека. Агент их не вводит: не потому,
 * что «так безопаснее звучит», а потому что владение аккаунтом должно
 * оставаться у владельца. Это единственный шаг во всей задаче, который нельзя
 * передать.
 *
 * ── ПОЧЕМУ ИМЕННО vibee-render ──────────────────────────────────────────────
 *
 * Проверено 06.09.2026: TELEGRAM_API_ID / TELEGRAM_API_HASH /
 * TELEGRAM_SESSION_STRING заданы на сервисе бота (999-multibots-telegraf), а
 * инструменты агента выполняются в vibee-render, где их НЕТ ни одной. Поэтому
 * `tg_contacts` в проде отвечает «нет сессии». Класть надо туда, где код.
 *
 * Заодно: сохранённая на сервисе бота строка МЕРТВА — подключение проходит,
 * `checkAuthorization()` возвращает false. Скопировать её недостаточно, нужен
 * свежий вход.
 *
 * ── БЕЗОПАСНОСТЬ ────────────────────────────────────────────────────────────
 *
 * Строка сессии — это полный доступ к аккаунту, сильнее пароля: она не
 * спрашивает второй фактор. Не отправляйте её в чат, не коммитьте, не
 * пересылайте. Вставляйте только в переменные окружения Railway.
 * Отозвать можно в Telegram: Настройки → Устройства → завершить сеанс.
 */
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const СЕРВИС = 'vibee-render'

async function main(): Promise<void> {
  const apiId = Number(process.env.TELEGRAM_API_ID || 0)
  const apiHash = process.env.TELEGRAM_API_HASH || ''

  if (!apiId || !apiHash) {
    console.error(
      [
        'Нет TELEGRAM_API_ID / TELEGRAM_API_HASH.',
        '',
        'Они уже заданы на сервисе бота — забрать их можно так:',
        '',
        '  railway service 999-multibots-telegraf',
        '  export TELEGRAM_API_ID=$(railway variables --kv | grep ^TELEGRAM_API_ID= | cut -d= -f2-)',
        '  export TELEGRAM_API_HASH=$(railway variables --kv | grep ^TELEGRAM_API_HASH= | cut -d= -f2-)',
        '',
        'Либо получить свои на https://my.telegram.org → API development tools.',
      ].join('\n')
    )
    process.exitCode = 1
    return
  }

  const rl = readline.createInterface({ input, output })
  const спросить = (вопрос: string) => rl.question(вопрос)

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  })

  try {
    await client.start({
      phoneNumber: () => спросить('Телефон (в формате +79991234567): '),
      phoneCode: () => спросить('Код из Telegram: '),
      password: () => спросить('Пароль двухфакторной защиты (если включён): '),
      onError: err => {
        console.error('Ошибка входа:', String(err))
      },
    })

    const me = await client.getMe()
    const имя =
      (me as { username?: string; firstName?: string }).username ||
      (me as { firstName?: string }).firstName ||
      'аккаунт'

    console.log('')
    console.log(`Вошли как ${имя}.`)
    console.log('')
    console.log('Строка сессии (не показывайте её никому):')
    console.log('')
    console.log(String(client.session.save()))
    console.log('')
    console.log('Положить её сюда:')
    console.log('')
    console.log(`  railway service ${СЕРВИС}`)
    console.log('  railway variables --set TELEGRAM_SESSION_STRING=<строка>')
    console.log(`  railway variables --set TELEGRAM_API_ID=${apiId}`)
    console.log('  railway variables --set TELEGRAM_API_HASH=<hash>')
    console.log('')
    console.log(
      'После этого агент получит доступ к диалогам, контактам и поиску по переписке.'
    )
    console.log(
      'Проверить: спросите агента «покажи мои диалоги» или вызовите tg_dialogs.'
    )
  } finally {
    rl.close()
    try {
      await client.disconnect()
    } catch {
      // Разрыв соединения не должен затирать напечатанную выше строку сессии.
    }
  }
}

void main()
