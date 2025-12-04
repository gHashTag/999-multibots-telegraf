#!/usr/bin/env node

/**
 * БОНУСНЫЕ ЗВЕЗДЫ ДЛЯ ПОЛЬЗОВАТЕЛЯ 435572800 (gaia @playom)
 *
 * Задача: Добавить 20,000 бонусных звезд пользователю с отрицательным балансом
 *
 * Текущее состояние:
 * - Telegram ID: 435572800
 * - Username: @playom
 * - Текущий баланс: -9511.56 звезд
 * - Проблема: Невозможно использовать функцию morphing из-за отрицательного баланса
 *
 * Решение:
 * - Добавить 20,000 звезд через payments_v2
 * - Тип: MONEY_INCOME
 * - Категория: BONUS
 * - Описание: Бонусные звезды от администратора
 *
 * Результат:
 * - Новый баланс: -9511.56 + 20000 = 10488.44 звезд
 */

// Загружаем переменные окружения из .env
require('dotenv').config();

// Инициализация Infisical для загрузки секретов
const { initInfisical, getSecret } = require("../dist/core/infisical/index.js");

// CONFIGURATION
const TARGET_USER_ID = "435572800";
const BONUS_STARS = 20000;
const ADMIN_REASON = "Бонусные звезды от администратора для пользователя с отрицательным балансом";
const CATEGORY = "BONUS";

/**
 * PHASE 0: Инициализация Infisical и загрузка секретов в process.env
 */
async function initializeInfisical() {
    console.log("🔐 PHASE 0: Инициализация Infisical и загрузка секретов...");

    console.log("📋 Проверка переменных окружения:");
    console.log("- INFISICAL_CLIENT_ID:", process.env.INFISICAL_CLIENT_ID ? '✅ Есть' : '❌ Нет');
    console.log("- INFISICAL_CLIENT_SECRET:", process.env.INFISICAL_CLIENT_SECRET ? '✅ Есть' : '❌ Нет');
    console.log("- INFISICAL_PROJECT_ID:", process.env.INFISICAL_PROJECT_ID ? '✅ Есть' : '❌ Нет');

    try {
        await initInfisical();

        // Копируем необходимые секреты в process.env для Supabase
        process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
        process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
        process.env.SUPABASE_ANON_KEY = getSecret('SUPABASE_ANON_KEY');

        console.log("✅ Infisical инициализирован успешно");
        console.log("✅ Секреты загружены и установлены в process.env");
        return true;
    } catch (error) {
        console.error("❌ Ошибка инициализации Infisical:", error.message);
        throw error;
    }
}

/**
 * PHASE 1: Проверка текущего состояния пользователя
 */
async function checkUserStatus(telegramId) {
    console.log("\n🔍 PHASE 1: Проверка текущего состояния пользователя...");

    // Импортируем Supabase после инициализации
    const { supabase } = require("../dist/core/supabase/index.js");

    try {
        // Получаем данные пользователя
        const userData = await supabase
            .from("users")
            .select("*")
            .eq("telegram_id", telegramId)
            .single();

        if (userData.error && userData.error.code === 'PGRST116') {
            console.log("❌ Пользователь не найден в базе данных!");
            return null;
        }

        // Получаем текущий баланс
        const { getUserBalance } = require("../dist/core/supabase/getUserBalance.js");
        const currentBalance = await getUserBalance(telegramId);

        // Получаем последние платежи
        const recentPayments = await supabase
            .from("payments_v2")
            .select("*")
            .eq("telegram_id", telegramId)
            .order("payment_date", { ascending: false })
            .limit(5);

        console.log("📊 ТЕКУЩЕЕ СОСТОЯНИЕ:");
        console.log("- Telegram ID:", telegramId);
        console.log("- Пользователь существует:", userData.data ? '✅ Да' : '❌ Нет');
        console.log("- Текущий баланс:", currentBalance, "звезд");
        console.log("- Последних платежей:", recentPayments.data?.length || 0);

        return {
            userData: userData.data,
            currentBalance: currentBalance,
            recentPayments: recentPayments.data || []
        };
    } catch (error) {
        console.error("❌ Ошибка при проверке пользователя:", error);
        throw error;
    }
}

/**
 * PHASE 2: Добавление бонусных звезд
 */
async function grantBonusStars(telegramId, starsAmount, reason, category) {
    console.log("\n💰 PHASE 2: Добавление бонусных звезд...");
    console.log(`- Количество звезд: ${starsAmount.toLocaleString()}`);
    console.log(`- Причина: ${reason}`);
    console.log(`- Категория: ${category}`);

    // Импортируем Supabase после инициализации
    const { supabase } = require("../dist/core/supabase/index.js");

    try {
        const result = await supabase
            .from("payments_v2")
            .insert({
                telegram_id: telegramId,
                amount: 0, // Бонусные звезды не имеют денежного эквивалента
                stars: starsAmount,
                currency: "XTR",
                status: "COMPLETED",
                type: "MONEY_INCOME",
                subscription_type: null,
                payment_method: "Admin_Bonus",
                bot_name: "admin_bonus_system",
                inv_id: `bonus-stars-${telegramId}-${Date.now()}`,
                description: reason,
                category: category, // Указываем категорию BONUS
                payment_date: new Date().toISOString(),
                metadata: {
                    grant_type: "bonus_stars",
                    admin_action: true,
                    reason: reason,
                    category: category,
                    target_user: telegramId,
                    timestamp: new Date().toISOString()
                }
            })
            .select()
            .single();

        if (result.error) {
            console.error("❌ Ошибка при добавлении бонусных звезд:", result.error);
            throw result.error;
        }

        console.log("✅ Бонусные звезды успешно добавлены!");
        console.log(`- ID платежа: ${result.data.id}`);
        console.log(`- Transaction ID: ${result.data.inv_id}`);

        return result.data;
    } catch (error) {
        console.error("❌ Ошибка при добавлении бонусных звезд:", error);
        throw error;
    }
}

/**
 * PHASE 3: Проверка результата
 */
async function verifyBonusGrant(telegramId, expectedStars, originalBalance) {
    console.log("\n🔍 PHASE 3: Проверка результата...");

    try {
        // Получаем новый баланс
        const { getUserBalance } = require("../dist/core/supabase/getUserBalance.js");
        const newBalance = await getUserBalance(telegramId);

        // Получаем информацию о подписке
        const { getUserDetailsSubscription } = require("../dist/core/supabase/getUserDetailsSubscription.js");
        const userDetails = await getUserDetailsSubscription(telegramId);

        console.log("\n📊 РЕЗУЛЬТАТ:");
        console.log("==================");
        console.log(`👤 Пользователь: ${telegramId}`);
        console.log(`💰 Баланс до: ${originalBalance} звезд`);
        console.log(`💰 Баланс после: ${newBalance} звезд`);
        console.log(`⭐ Добавлено: ${expectedStars} звезд`);
        console.log(`📈 Ожидаемый баланс: ${originalBalance + expectedStars} звезд`);
        console.log(`✅ Фактический баланс: ${newBalance} звезд`);

        const balanceCorrect = Math.abs(newBalance - (originalBalance + expectedStars)) < 0.01;

        if (balanceCorrect) {
            console.log("\n🎉 УСПЕХ! Бонусные звезды добавлены корректно!");
            console.log("=================================================");
            console.log(`✅ Функция morphing теперь доступна`);
            console.log(`✅ Пользователь может продолжить использование бота`);
        } else {
            console.log("\n⚠️ ВНИМАНИЕ! Баланс не соответствует ожиданиям!");
        }

        return {
            success: balanceCorrect,
            originalBalance: originalBalance,
            newBalance: newBalance,
            expectedBalance: originalBalance + expectedStars,
            userDetails: userDetails
        };
    } catch (error) {
        console.error("❌ Ошибка при проверке результата:", error);
        throw error;
    }
}

/**
 * MAIN EXECUTION FUNCTION
 */
async function executeBonusGrant() {
    console.log("🚀 ДОБАВЛЕНИЕ БОНУСНЫХ ЗВЕЗД");
    console.log("====================================");
    console.log(`👤 Пользователь: ${TARGET_USER_ID} (@playom)`);
    console.log(`⭐ Количество звезд: ${BONUS_STARS.toLocaleString()}`);
    console.log(`📋 Причина: ${ADMIN_REASON}`);
    console.log("");

    try {
        // Phase 0: Инициализация Infisical
        await initializeInfisical();

        // Phase 1: Проверяем текущее состояние
        const currentStatus = await checkUserStatus(TARGET_USER_ID);

        if (!currentStatus) {
            console.log("\n❌ Невозможно продолжить: пользователь не найден");
            return;
        }

        const originalBalance = currentStatus.currentBalance;

        // Phase 2: Добавляем бонусные звезды
        const bonusPayment = await grantBonusStars(
            TARGET_USER_ID,
            BONUS_STARS,
            ADMIN_REASON,
            CATEGORY
        );

        // Phase 3: Проверяем результат
        const verification = await verifyBonusGrant(
            TARGET_USER_ID,
            BONUS_STARS,
            originalBalance
        );

        if (verification.success) {
            console.log("\n📝 ИНФОРМАЦИЯ:");
            console.log("================");
            console.log("Бонусные звезды успешно добавлены!");
            console.log(`Новый баланс пользователя: ${verification.newBalance} звезд`);
            console.log("");
            console.log("Пользователь может теперь:");
            console.log("✅ Использовать функцию morphing");
            console.log("✅ Продолжить работу с ботом");
            console.log("✅ Генерировать изображения");
            console.log("");
            console.log("💡 Баланс будет автоматически обновлен во всех системах");
        } else {
            console.log("\n❌ ОШИБКА: Проверка показала некорректный баланс");
        }

    } catch (error) {
        console.error("\n💥 КРИТИЧЕСКАЯ ОШИБКА:", error);
        process.exit(1);
    }
}

// Запуск скрипта
if (require.main === module) {
    executeBonusGrant()
        .then(() => {
            console.log("\n✅ Скрипт выполнен успешно");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n❌ Скрипт завершился с ошибкой:", error);
            process.exit(1);
        });
}

module.exports = {
    executeBonusGrant,
    checkUserStatus,
    grantBonusStars,
    verifyBonusGrant
};
