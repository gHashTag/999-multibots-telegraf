/**
 * ВОССТАНАВЛИВАЕМ ДАННЫЕ ИЗ BACKUP В ОСНОВНУЮ ТАБЛИЦУ
 * Переносим ВСЕ транзакции один в один
 */

const { createClient } = require('@supabase/supabase-js');

// Подключение к Supabase через переменные окружения
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Ошибка: Не заданы переменные окружения SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  console.error('Запустите через Jest или установите переменные окружения');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function restoreFromBackup() {
  console.log('\n🔄 ВОССТАНАВЛИВАЕМ ДАННЫЕ ИЗ BACKUP В ОСНОВНУЮ ТАБЛИЦУ');
  console.log('='.repeat(80));

  try {
    // ШАГ 1: Подсчитываем данные в backup
    console.log('\n📊 ШАГ 1: Подсчитываем данные в BACKUP...');
    const { count: backupCount, error: backupCountError } = await supabase
      .from('payments_v2_backup')
      .select('*', { count: 'exact', head: true });

    if (backupCountError) throw backupCountError;
    console.log(`   Backup: ${backupCount} записей`);

    // ШАГ 2: Подсчитываем данные в основной таблице
    console.log('\n📊 ШАГ 2: Подсчитываем данные в ОСНОВНОЙ таблице...');
    const { count: mainCount, error: mainCountError } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true });

    if (mainCountError) throw mainCountError;
    console.log(`   Основная: ${mainCount} записей`);

    const difference = (backupCount || 0) - (mainCount || 0);
    console.log(`   Разница: ${difference > 0 ? '+' : ''}${difference} записей`);

    if (difference <= 0) {
      console.log('\n✅ В ОСНОВНОЙ ТАБЛИЦЕ УЖЕ БОЛЬШЕ ДАННЫХ, ЧЕМ В BACKUP!');
      console.log('   Восстановление не требуется.');
      return;
    }

    // ШАГ 3: Получаем все ID из backup
    console.log('\n📊 ШАГ 3: Получаем все ID из BACKUP...');
    const { data: backupIds, error: backupIdsError } = await supabase
      .from('payments_v2_backup')
      .select('id')
      .order('id', { ascending: true });

    if (backupIdsError) throw backupIdsError;

    console.log(`   ID из backup: ${backupIds.length}`);

    // ШАГ 4: Получаем все ID из основной таблицы
    console.log('\n📊 ШАГ 4: Получаем все ID из ОСНОВНОЙ таблицы...');
    const { data: mainIds, error: mainIdsError } = await supabase
      .from('payments_v2')
      .select('id');

    if (mainIdsError) throw mainIdsError;

    const mainIdSet = new Set((mainIds || []).map(row => row.id));
    console.log(`   ID из основной: ${mainIdSet.size}`);

    // ШАГ 5: Определяем какие ID нужно перенести
    console.log('\n📊 ШАГ 5: Определяем ID для переноса...');
    const idsToTransfer = backupIds
      .map(row => row.id)
      .filter(id => !mainIdSet.has(id));

    console.log(`   ID к переносу: ${idsToTransfer.length}`);

    if (idsToTransfer.length === 0) {
      console.log('\n✅ ВСЕ ДАННЫЕ УЖЕ ПЕРЕНЕСЕНЫ!');
      return;
    }

    // ШАГ 6: Загружаем данные для переноса (батчами)
    console.log('\n📊 ШАГ 6: Загружаем данные для переноса...');
    const batchSize = 500; // Увеличиваем батч
    let transferredCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < idsToTransfer.length; i += batchSize) {
      const batchIds = idsToTransfer.slice(i, i + batchSize);
      console.log(`\n   Батч ${Math.floor(i / batchSize) + 1}: ID ${i + 1}-${i + batchIds.length} из ${idsToTransfer.length}`);

      // Загружаем данные для этого батча
      const { data: batchData, error: batchDataError } = await supabase
        .from('payments_v2_backup')
        .select('*')
        .in('id', batchIds);

      if (batchDataError) {
        console.log(`   ❌ Ошибка загрузки батча: ${batchDataError.message}`);
        errorCount++;
        errors.push(batchDataError.message);
        continue;
      }

      if (!batchData || batchData.length === 0) {
        console.log(`   ⚠️ Батч пуст`);
        continue;
      }

      // Вставляем в основную таблицу
      const { data: insertData, error: insertError } = await supabase
        .from('payments_v2')
        .insert(batchData)
        .select('id');

      if (insertError) {
        console.log(`   ❌ Ошибка вставки: ${insertError.message}`);
        errorCount++;
        errors.push(insertError.message);
      } else {
        transferredCount += (insertData || []).length;
        console.log(`   ✅ Перенесено: ${transferredCount}/${idsToTransfer.length}`);
      }

      // Пауза между батчами
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // ШАГ 7: Проверяем результат
    console.log('\n📊 ШАГ 7: Проверяем результат...');
    const { count: newMainCount, error: newCountError } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true });

    if (newCountError) throw newCountError;

    console.log('\n' + '='.repeat(80));
    console.log('✅ ПЕРЕНОС ЗАВЕРШЁН!');
    console.log('='.repeat(80));
    console.log(`\n📊 СТАТИСТИКА:`);
    console.log(`   Исходное количество в основной: ${mainCount}`);
    console.log(`   ID к переносу: ${idsToTransfer.length}`);
    console.log(`   Перенесено успешно: ${transferredCount}`);
    console.log(`   Ошибок: ${errorCount}`);
    console.log(`   Теперь в основной таблице: ${newMainCount}`);
    console.log(`   Ожидалось: ${(mainCount || 0) + transferredCount}`);

    if (newMainCount === (mainCount || 0) + transferredCount) {
      console.log('\n✅ КОЛИЧЕСТВО СОВПАДАЕТ! Перенос успешен!');
    } else {
      console.log('\n⚠️ КОЛИЧЕСТВО НЕ СОВПАДАЕТ! Возможны проблемы.');
      console.log(`   Разница: ${Math.abs((mainCount || 0) + transferredCount - newMainCount)} записей`);
    }

    // Проверяем MetaMuse
    console.log('\n📊 ПРОВЕРЯЕМ METAMUSE_MANIFEST_BOT...');
    const { count: metamuseCount, error: metamuseError } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true })
      .eq('bot_name', 'MetaMuse_Manifest_bot');

    if (!metamuseError && metamuseCount !== null) {
      console.log(`   MetaMuse_Manifest_bot записей: ${metamuseCount}`);

      const { data: metamuseRub, error: rubError } = await supabase
        .from('payments_v2')
        .select('amount')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'RUB')
        .eq('type', 'MONEY_INCOME')
        .gt('amount', 0);

      if (!rubError && metamuseRub) {
        const rubSum = metamuseRub.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
        console.log(`   MetaMuse RUB доходы: ${Math.round(rubSum).toLocaleString()}₽ (${metamuseRub.length} транз.)`);
      }
    }

    if (errors.length > 0) {
      console.log('\n⚠️ ОШИБКИ:');
      errors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
      if (errors.length > 5) {
        console.log(`   ... и ещё ${errors.length - 5} ошибок`);
      }
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('\n❌ Критическая ошибка:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запускаем
restoreFromBackup();
