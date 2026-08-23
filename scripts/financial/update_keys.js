const https = require('https')
const { execSync } = require('child_process')

// 🔐 Учётка Infisical (Machine Identity) — ТОЛЬКО из окружения.
// Она открывает доступ ко ВСЕМ секретам проекта, в код её не зашивать.
// Где взять: railway variables --kv | grep INFISICAL_
//   либо https://app.infisical.com → project "999" → Access Control
//         → Machine Identities → Client ID / Client Secret
const INFISICAL_CLIENT_ID = process.env.INFISICAL_CLIENT_ID
const INFISICAL_CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET
const INFISICAL_PROJECT_ID = process.env.INFISICAL_PROJECT_ID

for (const [name, value] of [
  ['INFISICAL_CLIENT_ID', INFISICAL_CLIENT_ID],
  ['INFISICAL_CLIENT_SECRET', INFISICAL_CLIENT_SECRET],
  ['INFISICAL_PROJECT_ID', INFISICAL_PROJECT_ID],
]) {
  if (!value) {
    console.error(
      `❌ ${name} не задан. Взять: railway variables --kv | grep INFISICAL_`
    )
    process.exit(1)
  }
}

async function updateKeys() {
  console.log('🔑 Обновляем ключи INNGEST в Infisical...')

  // 1. Get auth token
  console.log('1️⃣ Получаем токен авторизации...')
  const authData = JSON.stringify({
    clientId: INFISICAL_CLIENT_ID,
    clientSecret: INFISICAL_CLIENT_SECRET, // secret-guard-ok: ссылка на переменную из process.env, литерала в коде нет
  })

  const authResult = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.infisical.com',
        path: '/api/v2/auth/universal-auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': authData.length,
        },
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => resolve(JSON.parse(data)))
      }
    )
    req.on('error', reject)
    req.write(authData)
    req.end()
  })

  const accessToken = authResult.accessToken
  console.log('✅ Токен получен')

  // 2. Update secrets
  console.log('\n2️⃣ Обновляем секреты...')
  const updateData = JSON.stringify({
    workspaceId: INFISICAL_PROJECT_ID,
    environment: 'prod',
    type: 'shared',
    secrets: [
      {
        secretKey: 'INNGEST_EVENT_KEY',
        secretValue:
          'DDRreS100AKTh7OAQNLHm7L7dHyMHTAhocQzHGYR6TfvEuHExLc-QYWj_ROzM0ZImzzFT9CskrsDHr7FB8-yPw',
        secretComment: 'Updated event key for Inngest',
      },
      {
        secretKey: 'INNGEST_SIGNING_KEY',
        secretValue:
          'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597',
        secretComment: 'Signing key for Inngest',
      },
    ],
  })

  const updateResult = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.infisical.com',
        path: '/api/v2/secrets/batch',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': updateData.length,
        },
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => resolve(JSON.parse(data)))
      }
    )
    req.on('error', reject)
    req.write(updateData)
    req.end()
  })

  console.log('✅ Секреты обновлены!')

  // 3. Restart container
  console.log('\n3️⃣ Перезапускаем контейнер...')
  try {
    execSync('docker restart 999-multibots', { stdio: 'inherit' })
    console.log('\n✅ КОНТЕЙНЕР ПЕРЕЗАПУЩЕН!')
    console.log('\n⏳ Подождите 15 секунд для полной загрузки...')
    console.log('\n📋 Проверьте логи:')
    console.log('   docker logs 999-multibots --tail 50 | grep INNGEST')
  } catch (error) {
    console.error('❌ Ошибка перезапуска:', error.message)
  }
}

updateKeys().catch(err => {
  console.error('❌ Критическая ошибка:', err.message)
  process.exit(1)
})
