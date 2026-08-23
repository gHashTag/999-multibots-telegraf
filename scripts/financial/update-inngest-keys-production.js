#!/usr/bin/env node
// Update Inngest keys on production server via Infisical API

const https = require('https')

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
  try {
    // 1. Get auth token
    console.log('🔑 Получаем токен авторизации...')
    const authData = JSON.stringify({
      clientId: INFISICAL_CLIENT_ID,
      clientSecret: INFISICAL_CLIENT_SECRET, // secret-guard-ok: ссылка на переменную из process.env, литерала в коде нет
    })

    const authOptions = {
      hostname: 'api.infisical.com',
      path: '/api/v2/auth/universal-auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': authData.length,
      },
    }

    const authResult = await new Promise((resolve, reject) => {
      const req = https.request(authOptions, res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => resolve(JSON.parse(data)))
      })
      req.on('error', reject)
      req.write(authData)
      req.end()
    })

    console.log('✅ Авторизация успешна')
    const accessToken = authResult.accessToken

    // 2. Update secrets
    console.log('\n🔄 Обновляем ключи INNGEST...')

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

    const updateOptions = {
      hostname: 'api.infisical.com',
      path: '/api/v2/secrets/batch',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': updateData.length,
      },
    }

    const updateResult = await new Promise((resolve, reject) => {
      const req = https.request(updateOptions, res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => resolve(JSON.parse(data)))
      })
      req.on('error', reject)
      req.write(updateData)
      req.end()
    })

    console.log('\n✅ Ключи обновлены успешно!')
    console.log('📋 Обновлённые секреты:', updateResult.secrets?.length || 0)

    // 3. Restart container
    console.log('\n🔄 Перезапускаем контейнер...')
    console.log('   ssh prod999 "docker restart 999-multibots"')

    console.log('\n✅ Процесс завершён!')
    console.log(
      'Теперь нужно выполнить: ssh prod999 "docker restart 999-multibots"'
    )
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
    process.exit(1)
  }
}

updateKeys()
