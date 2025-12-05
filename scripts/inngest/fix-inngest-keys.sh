#!/bin/bash
set -e

# 🎯 Автоматическое исправление Inngest Keys
# Этот скрипт сделает всё за вас

echo "🔑 ======================================="
echo "🔑  Inngest Keys FIX - Автоматическое решение"
echo "🔑 ======================================="
echo ""

# Проверка зависимостей
check_deps() {
    echo "📋 Проверка зависимостей..."

    if ! command -v infisical &> /dev/null; then
        echo "❌ Infisical CLI не установлен"
        echo "Установите: npm install -g @infisical/cli"
        exit 1
    fi

    if ! command -v ssh &> /dev/null; then
        echo "❌ SSH не найден"
        exit 1
    fi

    echo "✅ Все зависимости установлены"
}

# Запрос ключей у пользователя
get_keys() {
    echo ""
    echo "📝 ШАГ 1: Получение ключей из Inngest Dashboard"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Откройте в браузере:"
    echo "  👉 https://app.inngest.com/env/production/manage/keys"
    echo ""
    echo "Или используйте F12 → Network → найдите API call → скопируйте из Response:"
    echo "  - event_key"
    echo "  - signing_key"
    echo ""
    echo "Введите ключи (или оставьте пустым для пропуска):"
    echo ""

    read -p "INNGEST_EVENT_KEY: " EVENT_KEY
    read -p "INNGEST_SIGNING_KEY: " SIGNING_KEY

    # Если ключи не введены, просим ввести
    if [ -z "$EVENT_KEY" ] || [ -z "$SIGNING_KEY" ]; then
        echo ""
        echo "⚠️  Введите ОБА ключа для продолжения"
        echo ""
        read -p "INNGEST_EVENT_KEY: " EVENT_KEY
        read -p "INNGEST_SIGNING_KEY: " SIGNING_KEY
    fi

    # Проверяем формат ключей
    if [[ ! "$EVENT_KEY" =~ ^inngest_ ]] && [[ ! "$EVENT_KEY" =~ ^evt_ ]]; then
        echo ""
        echo "⚠️  Event Key должен начинаться с 'inngest_' или 'evt_'"
    fi

    if [[ ! "$SIGNING_KEY" =~ ^sign_ ]] && [[ ! "$SIGNING_KEY" =~ ^signing_ ]]; then
        echo ""
        echo "⚠️  Signing Key должен начинаться с 'sign_' или 'signing_'"
    fi

    echo ""
    echo "✅ Ключи получены"
}

# Добавление в Infisical
add_to_infisical() {
    echo ""
    echo "🔐 ШАГ 2: Добавление в Infisical"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Установка переменных окружения для Infisical
    export INFISICAL_CLIENT_ID="88fcf0cd-cce9-4844-bad2-8e19b4bad3ed"
    export INFISICAL_CLIENT_SECRET="b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314"
    export INFISICAL_PROJECT_ID="fd763fa3-35d5-4045-93bd-1795c5f00fc3"

    echo "🔄 Добавляем INNGEST_EVENT_KEY в Infisical (production)..."
    infisical secrets set --env=production --name=INNGEST_EVENT_KEY --value="$EVENT_KEY" || {
        echo "⚠️  Ошибка добавления INNGEST_EVENT_KEY в Infisical"
        echo "Попробуйте добавить вручную: https://app.infisical.com/"
        exit 1
    }

    echo "✅ INNGEST_EVENT_KEY добавлен"

    echo ""
    echo "🔄 Добавляем INNGEST_SIGNING_KEY в Infisical (production)..."
    infisical secrets set --env=production --name=INNGEST_SIGNING_KEY --value="$SIGNING_KEY" || {
        echo "⚠️  Ошибка добавления INNGEST_SIGNING_KEY в Infisical"
        echo "Попробуйте добавить вручную: https://app.infisical.com/"
        exit 1
    }

    echo "✅ INNGEST_SIGNING_KEY добавлен"
    echo ""
    echo "✅ Ключи успешно добавлены в Infisical (production)!"
}

# Перезапуск контейнера
restart_container() {
    echo ""
    echo "🔄 ШАГ 3: Перезапуск контейнера"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    echo "⏳ Перезапускаем 999-multibots..."
    ssh prod999 'docker restart 999-multibots' || {
        echo "❌ Ошибка перезапуска контейнера"
        exit 1
    }

    echo "✅ Контейнер перезапущен"
    echo ""
    echo "⏳ Ждём 10 секунд для полной загрузки..."
    sleep 10
}

# Проверка результата
verify_fix() {
    echo ""
    echo "✅ ШАГ 4: Проверка результата"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    echo "🔍 Проверяем логи контейнера..."

    # Проверяем, что ключи загружены
    ssh prod999 'docker logs 999-multibots --tail 50' | grep -q "INNGEST_EVENT_KEY" && {
        echo "✅ INNGEST_EVENT_KEY загружен в контейнер"
    } || {
        echo "⚠️  INNGEST_EVENT_KEY не найден в логах"
    }

    ssh prod999 'docker logs 999-multibots --tail 50' | grep -q "INNGEST_SIGNING_KEY" && {
        echo "✅ INNGEST_SIGNING_KEY загружен в контейнер"
    } || {
        echo "⚠️  INNGEST_SIGNING_KEY не найден в логах"
    }

    # Проверяем, что нет ошибок serve()
    ssh prod999 'docker logs 999-multibots --tail 50' | grep -q "Failed to create Inngest functions" && {
        echo "⚠️  Всё ещё есть ошибки создания функций"
    } || {
        echo "✅ Ошибки создания функций исправлены!"
    }

    echo ""
    echo "🔍 Проверяем endpoint..."
    if curl -s https://three-head-dragon.shop/api/inngest | grep -q "true"; then
        echo "✅ Endpoint /api/inngest отвечает!"
    else
        echo "⚠️  Endpoint может ещё не отвечать (попробуйте через минуту)"
    fi
}

# Финальные инструкции
final_instructions() {
    echo ""
    echo "🎉 ======================================="
    echo "🎉       INNGEST KEYS УСТАНОВЛЕНЫ!"
    echo "🎉 ======================================="
    echo ""
    echo "✅ Ключи добавлены в Infisical (production)"
    echo "✅ Контейнер перезапущен"
    echo "✅ Endpoint должен работать"
    echo ""
    echo "📋 СЛЕДУЮЩИЕ ШАГИ:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. Перейдите в Inngest Dashboard:"
    echo "   https://app.inngest.com/env/production/functions"
    echo ""
    echo "2. Нажмите 'Resync app' - должно сработать!"
    echo ""
    echo "3. Если что-то не работает, проверьте:"
    echo "   node scripts/check-inngest-status.js"
    echo ""
    echo "🔗 Быстрые команды:"
    echo "   ssh prod999 'docker logs 999-multibots -f'"
    echo "   node scripts/check-inngest-status.js"
    echo ""
}

# Главная функция
main() {
    check_deps
    get_keys
    add_to_infisical
    restart_container
    verify_fix
    final_instructions
}

# Запуск
main
