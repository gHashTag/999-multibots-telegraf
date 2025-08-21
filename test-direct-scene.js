#!/usr/bin/env node

// Простой тест - добавляем временную команду для прямого входа в сцену

console.log('📝 Добавьте эту команду в registerCommands.ts для тестирования:');
console.log('');
console.log('bot.command("testvidscene", async (ctx) => {');
console.log('  console.log("🧪 [TEST] Direct scene entry test");');
console.log('  await ctx.reply("🧪 Тестируем прямой вход в сцену...");');
console.log('  try {');
console.log('    await ctx.scene.enter("text_to_video");');
console.log('    console.log("✅ [TEST] Scene entered successfully");');
console.log('  } catch (error) {');
console.log('    console.error("❌ [TEST] Scene entry failed:", error);');
console.log('    await ctx.reply("❌ Ошибка входа в сцену: " + error.message);');
console.log('  }');
console.log('});');
console.log('');
console.log('Затем в боте напишите: /testvidscene');
console.log('');
console.log('Это поможет понять, работает ли сцена вообще.');