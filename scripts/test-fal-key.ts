#!/usr/bin/env bun
/**
 * Тестовый скрипт для проверки загрузки FAL_KEY из Infisical
 */

// Загружаем Infisical конфигурацию (как в основном боте)
import { InfisicalSDK } from '@infisical/sdk';

async function checkFalKey() {
  console.log('🔍 Проверка загрузки FAL_KEY из Infisical...\n');

  try {
    // Инициализируем Infisical клиент (правильный способ для SDK v4)
    const client = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
    });

    // Авторизация через Universal Auth
    await client.auth().universalAuth.login({
      clientId: process.env.INFISICAL_CLIENT_ID!,
      clientSecret: process.env.INFISICAL_CLIENT_SECRET!
    });

    console.log('✅ Авторизация в Infisical успешна\n');

    // Получаем секреты
    const result = await client.secrets().listSecrets({
      environment: process.env.INFISICAL_ENVIRONMENT || 'dev',
      projectId: process.env.INFISICAL_PROJECT_ID!,
      secretPath: '/',
    });

    const secrets = result.secrets;

    // Ищем FAL_KEY
    const falKeySecret = secrets.find((s: any) => s.secretKey === 'FAL_KEY');

    if (falKeySecret) {
      console.log('✅ FAL_KEY найден в Infisical');
      console.log(`   Длина ключа: ${falKeySecret.secretValue.length} символов`);
      console.log(`   Начинается с: ${falKeySecret.secretValue.substring(0, 10)}...`);

      // Проверяем дополнительные ключи LoRA
      const loraPath = secrets.find((s: any) => s.secretKey === 'FAL_DEFAULT_LORA_PATH');
      const loraTrigger = secrets.find((s: any) => s.secretKey === 'FAL_LORA_TRIGGER');
      const loraScale = secrets.find((s: any) => s.secretKey === 'FAL_DEFAULT_LORA_SCALE');

      console.log('\n📋 Дополнительные ключи LoRA:');
      console.log(`   FAL_DEFAULT_LORA_PATH: ${loraPath ? '✅ Найден' : '❌ Не найден (будет использован дефолт)'}`);
      console.log(`   FAL_LORA_TRIGGER: ${loraTrigger ? '✅ Найден' : '❌ Не найден (будет использован NEURO_SAGE)'}`);
      console.log(`   FAL_DEFAULT_LORA_SCALE: ${loraScale ? '✅ Найден' : '❌ Не найден (будет использован 1.0)'}`);

      console.log('\n🎉 Конфигурация готова! Бот может использовать Fal.ai с LoRA NEURO_SAGE');
      process.exit(0);
    } else {
      console.log('❌ FAL_KEY НЕ найден в Infisical');
      console.log('   Добавьте ключ через https://app.infisical.com/');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Ошибка при проверке:', error);
    process.exit(1);
  }
}

checkFalKey();
