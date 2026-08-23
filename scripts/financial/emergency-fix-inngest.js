#!/usr/bin/env node
// EMERGENCY: Direct Infisical API update via HTTP

// Значения ключей больше не хранятся в файле: он отслеживается git, и
// literal здесь равносилен опубликованному ключу. Отсутствие переменной
// падает громко на первой строке — пустая строка дала бы непонятную ошибку
// от Infisical через три вызова.
function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(
      `❌ ${name} не задан. Взять: railway variables --kv | grep ${name}`
    )
    process.exit(1)
  }
  return v
}

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

async function emergencyUpdate() {
  console.log('🚨 EMERGENCY: Обновление ключей напрямую через HTTP\n')

  const authData = JSON.stringify({
    clientId: INFISICAL_CLIENT_ID,
    clientSecret: INFISICAL_CLIENT_SECRET, // secret-guard-ok: ссылка на переменную из process.env, литерала в коде нет
  })

  try {
    // Step 1: Auth
    console.log('1️⃣ Авторизация...')
    const authResult = await makeRequest(
      '/api/v2/auth/universal-auth/login',
      'POST',
      authData
    )
    const accessToken = authResult.accessToken
    console.log('✅ Авторизован\n')

    // Step 2: Update BOT_INNGEST_EVENT_KEY
    console.log('2️⃣ Обновление BOT_INNGEST_EVENT_KEY...')
    const eventKeyData = JSON.stringify({
      workspaceId: INFISICAL_PROJECT_ID,
      environment: 'prod',
      type: 'shared',
      secrets: [
        {
          secretKey: 'BOT_INNGEST_EVENT_KEY',
          secretValue: requireEnv('BOT_INNGEST_EVENT_KEY'),
          secretComment: 'NEW Event key (emergency update)',
        },
      ],
    })
    await makeRequest(
      '/api/v2/secrets/batch',
      'POST',
      eventKeyData,
      accessToken
    )
    console.log('✅ INNGEST_EVENT_KEY обновлен\n')

    // Step 3: Update INNGEST_SIGNING_KEY
    console.log('3️⃣ Обновление INNGEST_SIGNING_KEY...')
    const signingKeyData = JSON.stringify({
      workspaceId: INFISICAL_PROJECT_ID,
      environment: 'prod',
      type: 'shared',
      secrets: [
        {
          secretKey: 'INNGEST_SIGNING_KEY',
          secretValue: requireEnv('INNGEST_SIGNING_KEY'),
          secretComment: 'Signing key (emergency update)',
        },
      ],
    })
    await makeRequest(
      '/api/v2/secrets/batch',
      'POST',
      signingKeyData,
      accessToken
    )
    console.log('✅ INNGEST_SIGNING_KEY обновлен\n')

    console.log('🎉 КЛЮЧЕ ОБНОВЛЕНЫ В INFISICAL!')
    console.log('\nТеперь нужно:')
    console.log('  1. Зарегистрировать новый ключ в Inngest Dashboard')
    console.log('  2. Перезапустить контейнер')
    console.log('\nКоманды:')
    console.log('  ssh prod999 "docker restart 999-multibots"')
    console.log(
      '  ssh prod999 "docker logs 999-multibots --tail 50 | grep INNGEST"'
    )
  } catch (error) {
    console.error('❌ Ошибка:', error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
    process.exit(1)
  }

  function makeRequest(path, method, data, token) {
    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const req = https.request(
        {
          hostname: 'api.infisical.com',
          path: path,
          method: method,
          headers: headers,
        },
        res => {
          let responseData = ''
          res.on('data', chunk => (responseData += chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(responseData))
            } catch (e) {
              reject(new Error('Failed to parse response: ' + responseData))
            }
          })
        }
      )

      req.on('error', reject)
      req.write(data)
      req.end()
    })
  }
}

emergencyUpdate()
