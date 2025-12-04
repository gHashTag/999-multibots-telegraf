// Прямая проверка через Infisical REST API
const https = require('https');

const INFISICAL_CLIENT_ID = '88fcf0cd-cce9-4844-bad2-8e19b4bad3ed';
const INFISICAL_CLIENT_SECRET = 'b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314';
const INFISICAL_PROJECT_ID = 'fd763fa3-35d5-4045-93bd-1795c5f00fc3';

async function fetchSecrets() {
  console.log('🔍 Проверяем секреты через Infisical REST API...\n');

  try {
    // 1. Получаем токен авторизации
    const authData = JSON.stringify({
      clientId: INFISICAL_CLIENT_ID,
      clientSecret: INFISICAL_CLIENT_SECRET
    });

    const authOptions = {
      hostname: 'api.infisical.com',
      path: '/api/v2/auth/universal-auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': authData.length
      }
    };

    console.log('1️⃣ Авторизация в Infisical...');
    const authResult = await new Promise((resolve, reject) => {
      const req = https.request(authOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(authData);
      req.end();
    });

    console.log('✅ Авторизация успешна');
    const accessToken = authResult.accessToken;
    console.log(`🔑 Token: ${accessToken.substring(0, 20)}...\n`);

    // 2. Получаем секреты из production
    console.log('2️⃣ Загрузка секретов из production...');
    const secretsOptions = {
      hostname: 'api.infisical.com',
      path: `/api/v2/secrets?environmentId=prod&projectId=${INFISICAL_PROJECT_ID}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    const secretsResult = await new Promise((resolve, reject) => {
      const req = https.request(secretsOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.end();
    });

    console.log(`✅ Загружено ${secretsResult.secrets.length} секретов\n`);

    // 3. Ищем INNGEST ключи
    const inngestSecrets = secretsResult.secrets.filter(s =>
      s.secretKey === 'INNGEST_EVENT_KEY' || s.secretKey === 'INNGEST_SIGNING_KEY'
    );

    console.log('📋 НАЙДЕННЫЕ INNGEST КЛЮЧИ:');
    console.log('='.repeat(60));

    const eventKey = inngestSecrets.find(s => s.secretKey === 'INNGEST_EVENT_KEY');
    const signingKey = inngestSecrets.find(s => s.secretKey === 'INNGEST_SIGNING_KEY');

    console.log(`INNGEST_EVENT_KEY:`);
    console.log(`  Value: ${eventKey ? eventKey.secretValue : 'N/A'}`);
    console.log(`  Full:  ${eventKey ? eventKey.secretValue : 'N/A'}`);
    console.log();

    console.log(`INNGEST_SIGNING_KEY:`);
    console.log(`  Value: ${signingKey ? signingKey.secretValue : 'N/A'}`);
    console.log(`  Full:  ${signingKey ? signingKey.secretValue : 'N/A'}`);
    console.log('='.repeat(60));

    // 4. Сравнение
    const EXPECTED_EVENT_KEY = '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q';
    const EXPECTED_SIGNING_KEY = 'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597';

    console.log('\n🔍 СРАВНЕНИЕ С ОЖИДАЕМЫМИ:');
    console.log('='.repeat(60));
    console.log(`Event Key Match:   ${eventKey?.secretValue === EXPECTED_EVENT_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`);
    console.log(`Signing Key Match: ${signingKey?.secretValue === EXPECTED_SIGNING_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`);
    console.log('='.repeat(60));

    if (eventKey?.secretValue === EXPECTED_EVENT_KEY && signingKey?.secretValue === EXPECTED_SIGNING_KEY) {
      console.log('\n🎉 ВСЕ КЛЮЧИ ПРАВИЛЬНЫЕ!');
    } else {
      console.log('\n⚠️  КЛЮЧИ НЕ СОВПАДАЮТ С ОЖИДАЕМЫМИ');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

fetchSecrets();
