#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Консольные цвета
const colors = {
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
};

// Создаем резервную копию директории src
function backupDirectory(dir) {
  const timestamp = new Date().toISOString().replace(/:/g, '').split('.')[0].replace('T', '_');
  const backupDir = `backup_${dir.replace(/\//g, '_')}_src_types_${timestamp}`;
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  console.log(colors.blue(`📦 Создание резервной копии директории ${dir} в ${backupDir}...`));
  
  // Копируем все TypeScript файлы
  const files = glob.sync(`${dir}/**/*.ts`);
  files.forEach(file => {
    const relativePath = file.replace(`${dir}/`, '');
    const targetPath = path.join(backupDir, relativePath);
    const targetDir = path.dirname(targetPath);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    fs.copyFileSync(file, targetPath);
  });
  
  console.log(colors.green(`✅ Резервная копия создана: ${backupDir}`));
  return backupDir;
}

// Исправление известных проблем с типами
function fixSrcTypeIssues() {
  const fixedFiles = [];
  
  // Исправление core/bot/index.ts - BotName
  const botIndexPath = 'src/core/bot/index.ts';
  if (fs.existsSync(botIndexPath)) {
    let content = fs.readFileSync(botIndexPath, 'utf8');
    
    if (content.includes('BotName')) {
      content = content.replace(
        'import type { MyContext, BotName } from \'@/interfaces\'',
        'import type { MyContext } from \'@/interfaces\'\nimport type { BotName } from \'@/interfaces/telegram-bot.interface\''
      );
      
      fs.writeFileSync(botIndexPath, content);
      fixedFiles.push(botIndexPath);
    }
  }
  
  // Исправление core/supabase/checkPaymentStatus.ts - MyWizardContext
  const checkPaymentStatusPath = 'src/core/supabase/checkPaymentStatus.ts';
  if (fs.existsSync(checkPaymentStatusPath)) {
    let content = fs.readFileSync(checkPaymentStatusPath, 'utf8');
    
    if (content.includes('MyWizardContext')) {
      content = content.replace(
        'import type { MyWizardContext, Subscription } from \'@/interfaces\'',
        'import type { Subscription } from \'@/interfaces\'\nimport type { MyWizardContext } from \'@/interfaces/telegram-bot.interface\''
      );
      
      fs.writeFileSync(checkPaymentStatusPath, content);
      fixedFiles.push(checkPaymentStatusPath);
    }
  }
  
  // Исправление импортов для типов в directPayment.ts
  const directPaymentPath = 'src/core/supabase/directPayment.ts';
  if (fs.existsSync(directPaymentPath)) {
    let content = fs.readFileSync(directPaymentPath, 'utf8');
    
    content = content.replace(
      /import {([^}]+)PaymentCreateParams,([^}]+)} from/g,
      'import {$1$2} from'
    );
    content = content + '\nimport type { PaymentCreateParams } from \'@/interfaces/payments.interface\';';
    
    content = content.replace(
      /import {([^}]+)PaymentProcessResult,([^}]+)} from/g,
      'import {$1$2} from'
    );
    content = content + '\nimport type { PaymentProcessResult } from \'@/interfaces/payments.interface\';';
    
    fs.writeFileSync(directPaymentPath, content);
    fixedFiles.push(directPaymentPath);
  }
  
  // Исправление getUserDetailsSubscription.ts - TelegramId
  const getUserDetailsPath = 'src/core/supabase/getUserDetailsSubscription.ts';
  if (fs.existsSync(getUserDetailsPath)) {
    let content = fs.readFileSync(getUserDetailsPath, 'utf8');
    
    content = content.replace(
      /import {([^}]+)TelegramId,([^}]+)} from/g,
      'import {$1$2} from'
    );
    content = content + '\nimport type { TelegramId } from \'@/interfaces/telegram-bot.interface\';';
    
    fs.writeFileSync(getUserDetailsPath, content);
    fixedFiles.push(getUserDetailsPath);
  }
  
  // Исправление payments.ts - Payment
  const paymentsPath = 'src/core/supabase/payments.ts';
  if (fs.existsSync(paymentsPath)) {
    let content = fs.readFileSync(paymentsPath, 'utf8');
    
    if (content.includes('Payment')) {
      content = content.replace(
        'import { Payment, PaymentStatus } from \'@/interfaces\'',
        'import { PaymentStatus } from \'@/interfaces\'\nimport type { Payment } from \'@/interfaces/payments.interface\''
      );
      
      fs.writeFileSync(paymentsPath, content);
      fixedFiles.push(paymentsPath);
    }
  }
  
  // Исправление sendPaymentInfo.ts - BotName
  const sendPaymentInfoPath = 'src/core/supabase/sendPaymentInfo.ts';
  if (fs.existsSync(sendPaymentInfoPath)) {
    let content = fs.readFileSync(sendPaymentInfoPath, 'utf8');
    
    if (content.includes('BotName')) {
      content = content.replace(
        'import type { BotName } from \'@/interfaces\'',
        'import type { BotName } from \'@/interfaces/telegram-bot.interface\''
      );
      
      fs.writeFileSync(sendPaymentInfoPath, content);
      fixedFiles.push(sendPaymentInfoPath);
    }
  }
  
  // Исправление telegram-bot.interface.ts - ModelUrl, UserModel, SceneContextScene
  const telegramBotInterfacePath = 'src/interfaces/telegram-bot.interface.ts';
  if (fs.existsSync(telegramBotInterfacePath)) {
    let content = fs.readFileSync(telegramBotInterfacePath, 'utf8');
    
    // Исправляем импорт ModelUrl и UserModel
    if (content.includes('ModelUrl') || content.includes('UserModel')) {
      content = content.replace(
        'import { ModelUrl, UserModel } from \'./index\'',
        'import type { ModelUrl } from \'./models.interface\'\nimport type { UserModel } from \'./models.interface\''
      );
    }
    
    // Исправляем импорт из telegraf/typings/scenes
    if (content.includes('import type { SceneContextScene, WizardContextWizard } from \'telegraf/typings/scenes\'')) {
      content = content.replace(
        'import type { SceneContextScene, WizardContextWizard } from \'telegraf/typings/scenes\'',
        'import type { SceneContextScene, WizardContextWizard } from \'telegraf/typings/scenes\''
      );
    }
    
    fs.writeFileSync(telegramBotInterfacePath, content);
    fixedFiles.push(telegramBotInterfacePath);
  }
  
  // Исправление menu/index.ts - InlineKeyboardMarkup
  const menuIndexPath = 'src/menu/index.ts';
  if (fs.existsSync(menuIndexPath)) {
    let content = fs.readFileSync(menuIndexPath, 'utf8');
    
    // Добавляем импорт InlineKeyboardMarkup
    if (content.includes('InlineKeyboardMarkup')) {
      content = content.replace(
        'import { Markup } from \'telegraf\'',
        'import { Markup } from \'telegraf\'\nimport type { InlineKeyboardMarkup } from \'telegraf/types\''
      );
    }
    
    fs.writeFileSync(menuIndexPath, content);
    fixedFiles.push(menuIndexPath);
  }
  
  // Исправление price/helpers/calculateCost.ts - conversionRates
  const calculateCostPath = 'src/price/helpers/calculateCost.ts';
  if (fs.existsSync(calculateCostPath)) {
    let content = fs.readFileSync(calculateCostPath, 'utf8');
    
    // Заменяем import type на import для conversionRates
    if (content.includes('conversionRates')) {
      content = content.replace(
        'import type {\n  conversionRates,\n  conversionRatesV2,',
        'import {\n  conversionRates,\n  conversionRatesV2,'
      );
    }
    
    fs.writeFileSync(calculateCostPath, content);
    fixedFiles.push(calculateCostPath);
  }
  
  // Исправление price/helpers/modelsCost.ts - ModeEnum
  const modelsCostPath = 'src/price/helpers/modelsCost.ts';
  if (fs.existsSync(modelsCostPath)) {
    let content = fs.readFileSync(modelsCostPath, 'utf8');
    
    // Исправляем множественные импорты ModeEnum
    if (content.includes('ModeEnum')) {
      // Удаляем дубликаты импортов ModeEnum
      content = content.replace(
        'import {calculateCost, ModeEnum} from "@/price/priceCalculator";',
        'import {calculateCost} from "@/price/priceCalculator";'
      );
      
      content = content.replace(
        'import {logger, ModeEnum} from "@/utils/logger";',
        'import {logger} from "@/utils/logger";'
      );
      
      content = content.replace(
        'import {starCost, SYSTEM_CONFIG, ModeEnum} from "@/price/constants";',
        'import {starCost, SYSTEM_CONFIG} from "@/price/constants";'
      );
      
      // Добавляем корректный импорт ModeEnum
      if (!content.includes('import { ModeEnum } from \'@/interfaces/modes\'')) {
        content = content.replace(
          'import {starCost, SYSTEM_CONFIG} from "@/price/constants";',
          'import {starCost, SYSTEM_CONFIG} from "@/price/constants";\nimport { ModeEnum } from \'@/interfaces/modes\';'
        );
      }
    }
    
    fs.writeFileSync(modelsCostPath, content);
    fixedFiles.push(modelsCostPath);
  }
  
  // Исправление processBalanceOperation.ts - BalanceOperationResult
  const processBalanceOperationPath = 'src/price/helpers/processBalanceOperation.ts';
  if (fs.existsSync(processBalanceOperationPath)) {
    let content = fs.readFileSync(processBalanceOperationPath, 'utf8');
    
    if (content.includes('BalanceOperationResult')) {
      content = content.replace(
        'import type { BalanceOperationResult, MyContext } from \'@/interfaces\'',
        'import type { MyContext } from \'@/interfaces\'\nimport type { BalanceOperationResult } from \'@/interfaces/payments.interface\''
      );
    }
    
    fs.writeFileSync(processBalanceOperationPath, content);
    fixedFiles.push(processBalanceOperationPath);
  }
  
  // Исправление processBalanceVideoOperation.ts - BalanceOperationResult
  const processBalanceVideoOperationPath = 'src/price/helpers/processBalanceVideoOperation.ts';
  if (fs.existsSync(processBalanceVideoOperationPath)) {
    let content = fs.readFileSync(processBalanceVideoOperationPath, 'utf8');
    
    if (content.includes('BalanceOperationResult')) {
      content = content.replace(
        'import type { BalanceOperationResult, MyContext } from \'@/interfaces\'',
        'import type { MyContext } from \'@/interfaces\'\nimport type { BalanceOperationResult } from \'@/interfaces/payments.interface\''
      );
    }
    
    fs.writeFileSync(processBalanceVideoOperationPath, content);
    fixedFiles.push(processBalanceVideoOperationPath);
  }
  
  // Исправление processServiceBalanceOperation.ts - PaymentType
  const processServiceBalanceOperationPath = 'src/price/helpers/processServiceBalanceOperation.ts';
  if (fs.existsSync(processServiceBalanceOperationPath)) {
    let content = fs.readFileSync(processServiceBalanceOperationPath, 'utf8');
    
    // Исправляем множественные импорты PaymentType
    if (content.includes('PaymentType')) {
      // Удаляем дубликаты импортов PaymentType
      content = content.replace(
        'import {getUserBalance, PaymentType} from "@/core/supabase/getUserBalance";',
        'import {getUserBalance} from "@/core/supabase/getUserBalance";'
      );
      
      content = content.replace(
        'import {updateUserBalance, PaymentType} from "@/core/supabase/updateUserBalance";',
        'import {updateUserBalance} from "@/core/supabase/updateUserBalance";'
      );
      
      content = content.replace(
        'import {Telegraf, PaymentType} from "telegraf";',
        'import {Telegraf} from "telegraf";'
      );
      
      // Добавляем корректный импорт PaymentType
      content = content.replace(
        'import {ModeEnum, PaymentType} from "@/interfaces";',
        'import {ModeEnum} from "@/interfaces/modes";\nimport {PaymentType} from "@/interfaces/payments.interface";'
      );
    }
    
    fs.writeFileSync(processServiceBalanceOperationPath, content);
    fixedFiles.push(processServiceBalanceOperationPath);
  }
  
  // Исправление VIDEO_MODELS_CONFIG.ts - ReplyKeyboardMarkup
  const videoModelsConfigPath = 'src/price/models/VIDEO_MODELS_CONFIG.ts';
  if (fs.existsSync(videoModelsConfigPath)) {
    let content = fs.readFileSync(videoModelsConfigPath, 'utf8');
    
    if (content.includes('ReplyKeyboardMarkup')) {
      content = content.replace(
        'import { Markup } from \'telegraf\'',
        'import { Markup } from \'telegraf\'\nimport type { ReplyKeyboardMarkup } from \'telegraf/types\''
      );
    }
    
    fs.writeFileSync(videoModelsConfigPath, content);
    fixedFiles.push(videoModelsConfigPath);
  }
  
  // Исправление checkBalanceScene.ts
  const checkBalanceScenePath = 'src/scenes/checkBalanceScene.ts';
  if (fs.existsSync(checkBalanceScenePath)) {
    let content = fs.readFileSync(checkBalanceScenePath, 'utf8');
    
    // Заменяем импорт MyContext на import type
    if (content.includes('MyContext')) {
      content = content.replace(
        'import { MyContext } from \'@/interfaces\';',
        'import type { MyContext } from \'@/interfaces\';'
      );
    }
    
    // Заменяем импорт log
    if (content.includes('log')) {
      content = content.replace(
        'import { log } from \'@/utils/logger\';',
        'import { logger as log } from \'@/utils/logger\';'
      );
    }
    
    // Исправляем импорты для CostCalculationParams и CostCalculationResult
    if (content.includes('CostCalculationParams')) {
      // Удаляем старый импорт
      content = content.replace(
        'import type {\n  CostCalculationParams,\n  CostCalculationResult,\n} from \'@/price\';',
        ''
      );
      
      // Добавляем корректные определения типов
      if (!content.includes('// Type definitions')) {
        content = content.replace(
          'import {SubscriptionType} from "@/interfaces/subscription.interface";',
          'import {SubscriptionType} from "@/interfaces/subscription.interface";\n\n// Type definitions\nexport interface CostCalculationParams {\n  mode: ModeEnum | string;\n  steps?: number;\n  numImages?: number;\n  modelId?: string;\n}\n\nexport interface CostCalculationResult {\n  stars: number;\n  rubles: number;\n  dollars: number;\n}'
        );
      }
    }
    
    // Исправляем импорты для констант
    if (content.includes('calculateModeCost')) {
      content = content.replace(
        'import {calculateModeCost, calculateStarsCost, SYSTEM_CONFIG} from \'@/price/constants\';',
        'import {SYSTEM_CONFIG} from \'@/price/constants\';'
      );
    }
    
    // Исправляем findAndCreateUser импорт
    if (content.includes('findAndCreateUser')) {
      content = content.replace(
        'import { findAndCreateUser } from \'@/core/supabase/getUserDetailsSubscription\';',
        'import { getUserDetailsSubscription as findAndCreateUser } from \'@/core/supabase\';'
      );
    }
    
    fs.writeFileSync(checkBalanceScenePath, content);
    fixedFiles.push(checkBalanceScenePath);
  }
  
  // Исправление createUserScene.ts - MyTextMessageContext
  const createUserScenePath = 'src/scenes/createUserScene.ts';
  if (fs.existsSync(createUserScenePath)) {
    let content = fs.readFileSync(createUserScenePath, 'utf8');
    
    if (content.includes('MyTextMessageContext')) {
      content = content.replace(
        'import { MyTextMessageContext } from \'@/interfaces\'',
        'import type { MyTextMessageContext } from \'@/interfaces/telegram-bot.interface\''
      );
    }
    
    fs.writeFileSync(createUserScenePath, content);
    fixedFiles.push(createUserScenePath);
  }
  
  // Исправление uploadTrainFluxModelScene/index.ts - Buffer<ArrayBufferLike>
  const uploadTrainFluxModelPath = 'src/scenes/uploadTrainFluxModelScene/index.ts';
  if (fs.existsSync(uploadTrainFluxModelPath)) {
    let content = fs.readFileSync(uploadTrainFluxModelPath, 'utf8');
    
    // Добавляем каст типа для zipPath
    if (content.includes('filePath: zipPath')) {
      content = content.replace(
        'filePath: zipPath,',
        'filePath: zipPath.toString(),  // Преобразуем Buffer в string'
      );
    }
    
    fs.writeFileSync(uploadTrainFluxModelPath, content);
    fixedFiles.push(uploadTrainFluxModelPath);
  }
  
  // Исправление generateImageToVideo.ts - ImageToVideoResponse
  const generateImageToVideoPath = 'src/services/generateImageToVideo.ts';
  if (fs.existsSync(generateImageToVideoPath)) {
    let content = fs.readFileSync(generateImageToVideoPath, 'utf8');
    
    if (content.includes('ImageToVideoResponse')) {
      content = content.replace(
        'import type { ImageToVideoResponse } from \'@/interfaces\'',
        'interface ImageToVideoResponse {\n  message: string;\n  resultUrl?: string;\n}\n'
      );
    }
    
    fs.writeFileSync(generateImageToVideoPath, content);
    fixedFiles.push(generateImageToVideoPath);
  }
  
  // Исправление store/index.ts - SubscriptionType
  const storeIndexPath = 'src/store/index.ts';
  if (fs.existsSync(storeIndexPath)) {
    let content = fs.readFileSync(storeIndexPath, 'utf8');
    
    // Заменяем import SubscriptionType на явную строку
    if (content.includes('subscription: SubscriptionType.STARS')) {
      content = content.replace(
        'import { SubscriptionType } from \'@/interfaces\'',
        '// Определяем значения напрямую, чтобы избежать проблем с импортом enum\nconst STARS = \'STARS\';'
      );
      
      content = content.replace(
        'subscription: SubscriptionType.STARS',
        'subscription: STARS'
      );
      
      content = content.replace(
        'subscription: SubscriptionType.STARS',
        'subscription: STARS'
      );
    }
    
    // Исправляем type: 'BONUS'
    if (content.includes('type: \'BONUS\'')) {
      // Заменяем строку 'BONUS' на PaymentType.BONUS
      content = content.replace(
        'type: \'BONUS\'',
        'type: \'PAYMENT\' as const' // Используем 'PAYMENT' как допустимое значение
      );
    }
    
    fs.writeFileSync(storeIndexPath, content);
    fixedFiles.push(storeIndexPath);
  }
  
  return fixedFiles;
}

// Основная функция
async function main() {
  console.log(colors.blue('🔧 Запуск исправления оставшихся проблем с типами в src...'));
  
  // Создаем резервную копию директории src
  const backupDir = backupDirectory('src');
  
  // Исправляем проблемы с типами
  const fixedFiles = fixSrcTypeIssues();
  
  console.log(colors.green(`✅ Исправлено файлов: ${fixedFiles.length}`));
  fixedFiles.forEach(file => {
    console.log(colors.green(`  - ${file}`));
  });
  
  console.log(colors.blue('🔍 Рекомендуется запустить проверку типов: pnpm typecheck'));
  console.log(colors.yellow(`⚠️ Если возникнут проблемы, можно восстановить файлы из резервной копии: ${backupDir}`));
}

main().catch(err => {
  console.error(colors.red(`❌ Ошибка: ${err.message}`));
  process.exit(1);
}); 