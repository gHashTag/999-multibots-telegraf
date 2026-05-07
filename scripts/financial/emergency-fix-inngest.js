#!/usr/bin/env node
// EMERGENCY: Direct Infisical API update via HTTP
const https = require('https');

async function emergencyUpdate() {
  console.log('🚨 EMERGENCY: Обновление ключей напрямую через HTTP\n');

  const authData = JSON.stringify({
    clientId: '88fcf0cd-cce9-4844-bad2-8e19b4bad3ed',
    clientSecret: 'b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314'
  });

  try {
    // Step 1: Auth
    console.log('1️⃣ Авторизация...');
    const authResult = await makeRequest('/api/v2/auth/universal-auth/login', 'POST', authData);
    const accessToken = authResult.accessToken;
    console.log('✅ Авторизован\n');

    // Step 2: Update BOT_INNGEST_EVENT_KEY
    console.log('2️⃣ Обновление BOT_INNGEST_EVENT_KEY...');
    const eventKeyData = JSON.stringify({
      workspaceId: 'fd763fa3-35d5-4045-93bd-1795c5f00fc3',
      environment: 'prod',
      type: 'shared',
      secrets: [{
        secretKey: 'BOT_INNGEST_EVENT_KEY',
        secretValue: 'DDRreS100AKTh7OAQNLHm7L7dHyMHTAhocQzHGYR6TfvEuHExLc-QYWj_ROzM0ZImzzFT9CskrsDHr7FB8-yPw',
        secretComment: 'NEW Event key (emergency update)'
      }]
    });
    await makeRequest('/api/v2/secrets/batch', 'POST', eventKeyData, accessToken);
    console.log('✅ INNGEST_EVENT_KEY обновлен\n');

    // Step 3: Update INNGEST_SIGNING_KEY
    console.log('3️⃣ Обновление INNGEST_SIGNING_KEY...');
    const signingKeyData = JSON.stringify({
      workspaceId: 'fd763fa3-35d5-4045-93bd-1795c5f00fc3',
      environment: 'prod',
      type: 'shared',
      secrets: [{
        secretKey: 'INNGEST_SIGNING_KEY',
        secretValue: 'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597',
        secretComment: 'Signing key (emergency update)'
      }]
    });
    await makeRequest('/api/v2/secrets/batch', 'POST', signingKeyData, accessToken);
    console.log('✅ INNGEST_SIGNING_KEY обновлен\n');

    console.log('🎉 КЛЮЧЕ ОБНОВЛЕНЫ В INFISICAL!');
    console.log('\nТеперь нужно:');
    console.log('  1. Зарегистрировать новый ключ в Inngest Dashboard');
    console.log('  2. Перезапустить контейнер');
    console.log('\nКоманды:');
    console.log('  ssh prod999 "docker restart 999-multibots"');
    console.log('  ssh prod999 "docker logs 999-multibots --tail 50 | grep INNGEST"');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }

  function makeRequest(path, method, data, token) {
    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = https.request({
        hostname: 'api.infisical.com',
        path: path,
        method: method,
        headers: headers
      }, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            reject(new Error('Failed to parse response: ' + responseData));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

emergencyUpdate();
