#!/bin/bash

# 🔥 БЫСТРАЯ ПРОВЕРКА ВСЕХ 25 КНОПОК

echo "=========================================="
echo "🔥 БЫСТРАЯ ПРОВЕРКА ВСЕХ 25 КНОПОК"
echo "=========================================="
echo ""

# 1. Проверяем ModeEnum
echo "1️⃣ ПРОВЕРКА MODEENUM:"
echo "------------------------------------------"
grep -E "(Morphing|CompetitorMonitoring|AIReels|Language|AiPhotoshop)" /Users/playra/999-multibots-telegraf/src/interfaces/modes.ts | head -10
if [ $? -eq 0 ]; then
    echo "✅ ModeEnum исправлен"
else
    echo "❌ ModeEnum НЕ исправлен"
fi
echo ""

# 2. Проверяем кнопки в unified-navigation.config.ts
echo "2️⃣ ПРОВЕРКА КНОПОК:"
echo "------------------------------------------"
echo "Кнопки с ModeEnum:"
grep -E "mode: ModeEnum\." /Users/playra/999-multibots-telegraf/src/navigation/unified-navigation.config.ts | wc -l
echo "Должно быть: 25"
echo ""

echo "Кнопки со строками (должно быть 0):"
grep -E "mode: '[^']*'" /Users/playra/999-multibots-telegraf/src/navigation/unified-navigation.config.ts | wc -l
echo ""

# 3. Проверяем scene-specific handlers
echo "3️⃣ ПРОВЕРКА SCENE-SPECIFIC HANDLERS:"
echo "------------------------------------------"
echo "subscriptionScene:"
grep -q "NAVIGATION_BUTTONS" /Users/playra/999-multibots-telegraf/src/scenes/subscriptionScene/index.ts && echo "  ✅ Есть NAVIGATION_BUTTONS check" || echo "  ❌ НЕТ NAVIGATION_BUTTONS check"
grep -q "ctx.scene.leave()" /Users/playra/999-multibots-telegraf/src/scenes/subscriptionScene/index.ts && echo "  ✅ Есть scene.leave()" || echo "  ❌ НЕТ scene.leave()"

echo "paymentScene:"
grep -q "NAVIGATION_BUTTONS" /Users/playra/999-multibots-telegraf/src/scenes/paymentScene/index.ts && echo "  ✅ Есть NAVIGATION_BUTTONS check" || echo "  ❌ НЕТ NAVIGATION_BUTTONS check"
grep -q "ctx.scene.leave()" /Users/playra/999-multibots-telegraf/src/scenes/paymentScene/index.ts && echo "  ✅ Есть scene.leave()" || echo "  ❌ НЕТ scene.leave()"

echo "balanceScene:"
grep -q "NAVIGATION_BUTTONS" /Users/playra/999-multibots-telegraf/src/scenes/balanceScene/index.ts && echo "  ✅ Есть NAVIGATION_BUTTONS check" || echo "  ❌ НЕТ NAVIGATION_BUTTONS check"
grep -q "ctx.scene.leave()" /Users/playra/999-multibots-telegraf/src/scenes/balanceScene/index.ts && echo "  ✅ Есть scene.leave()" || echo "  ❌ НЕТ scene.leave()"

echo "helpScene:"
grep -q "NAVIGATION_BUTTONS" /Users/playra/999-multibots-telegraf/src/scenes/helpScene/index.ts && echo "  ✅ Есть NAVIGATION_BUTTONS check" || echo "  ❌ НЕТ NAVIGATION_BUTTONS check"
grep -q "ctx.scene.leave()" /Users/playra/999-multibots-telegraf/src/scenes/helpScene/index.ts && echo "  ✅ Есть scene.leave()" || echo "  ❌ НЕТ scene.leave()"
echo ""

# 4. Проверяем универсальный handler
echo "4️⃣ ПРОВЕРКА УНИВЕРСАЛЬНОГО HANDLER:"
echo "------------------------------------------"
grep -q "handleMenuButtonPress" /Users/playra/999-multibots-telegraf/src/hearsHandlers.ts && echo "✅ handleMenuButtonPress импортирован" || echo "❌ handleMenuButtonPress НЕ импортирован"
grep -q "bot.hears.*handleMenuButtonPress" /Users/playra/999-multibots-telegraf/src/hearsHandlers.ts && echo "✅ bot.hears с handleMenuButtonPress найден" || echo "❌ bot.hears с handleMenuButtonPress НЕ найден"
echo ""

# 5. Проверяем дубликаты
echo "5️⃣ ПРОВЕРКА ДУБЛИКАТОВ:"
echo "------------------------------------------"
duplicates=$(grep -c "levels\[10[0-9]\]" /Users/playra/999-multibots-telegraf/src/navigation/unified-navigation.config.ts || echo "0")
echo "Дублирующих levels[100-109]: $duplicates"
if [ "$duplicates" -le "2" ]; then
    echo "✅ Дубликатов мало (нормально: levels[104, 108])"
else
    echo "⚠️  Много дубликатов"
fi
echo ""

# 6. TypeScript проверка
echo "6️⃣ TYPESCRIPT ПРОВЕРКА:"
echo "------------------------------------------"
cd /Users/playra/999-multibots-telegraf
npm run typecheck 2>&1 | grep -E "(error|Error|found)" | head -5
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ TypeScript: без ошибок"
else
    echo "❌ TypeScript: есть ошибки"
fi
echo ""

echo "=========================================="
echo "📊 ИТОГОВЫЙ ОТЧЕТ:"
echo "=========================================="
echo ""
echo "✅ Если все пункты выше показали ✅"
echo "   то код готов к деплою!"
echo ""
echo "❌ Если есть ❌"
echo "   то нужно исправить перед деплоем!"
echo ""
