const TELEGRAM_PROFILE_DEEP_LINK = 'https://t.me/t27ai_bot?startapp=profile'

// Deterministic QR matrix for the public deep link above (QR Code Model 2,
// error correction M). It is deliberately static: pairing codes, sessions,
// Telegram initData and access tokens can never become part of the payload.
const TELEGRAM_PROFILE_QR_ROWS = [
  '11111110100001110111101111111',
  '10000010011011100000001000001',
  '10111010110111110110001011101',
  '10111010101011011111101011101',
  '10111010111001110100101011101',
  '10000010111001110011101000001',
  '11111110101010101010101111111',
  '00000000000100000001100000000',
  '00111111000000110110110111101',
  '10101000001001000001111010001',
  '11011010110111101101000011101',
  '11010000010111100011101000000',
  '01000110010001101011000110000',
  '10011000100001110000011101010',
  '00110110101100101001011010111',
  '01010100001010111011001110111',
  '10101111010011001111100011001',
  '11010100100010001010100010001',
  '00000110000101100011000101100',
  '10001001110101011000101101001',
  '00111111010001111110111110010',
  '00000000010000011011100011000',
  '11111110111101000101101010101',
  '10000010101101110101100010001',
  '10111010111101100100111110111',
  '10111010100110101000011001111',
  '10111010100010101110111011101',
  '10000010000100010001110001110',
  '11111110010001000100110101000',
] as const

const QUIET_ZONE = 4
const QR_SIZE = TELEGRAM_PROFILE_QR_ROWS.length
const VIEWBOX_SIZE = QR_SIZE + QUIET_ZONE * 2
const QR_PATH = TELEGRAM_PROFILE_QR_ROWS.flatMap((row, y) =>
  [...row].flatMap((module, x) =>
    module === '1' ? [`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`] : []
  )
).join('')

export function TelegramMiniAppQr({
  expanded = false,
}: {
  expanded?: boolean
}) {
  return (
    <details className="pair-with-app__qr" open={expanded || undefined}>
      <summary>{'Открыть Mini App по QR'}</summary>
      <div className="pair-with-app__qr-content">
        <svg
          className="pair-with-app__qr-code"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          role="img"
          aria-label="QR-код для Mini App @t27ai_bot"
          shapeRendering="crispEdges"
        >
          <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} fill="#ffffff" />
          <path d={QR_PATH} fill="#031109" />
        </svg>
        <div className="pair-with-app__qr-copy">
          <strong>{'Сканируйте камерой телефона'}</strong>
          <span>
            {
              'Откроется официальный Mini App. Код входа, токен и данные сессии в QR не передаются.'
            }
          </span>
          <a
            className="pair-with-app__qr-link"
            href={TELEGRAM_PROFILE_DEEP_LINK}
            target="_blank"
            rel="noreferrer"
          >
            {'Открыть @t27ai_bot напрямую'}
          </a>
        </div>
      </div>
    </details>
  )
}
