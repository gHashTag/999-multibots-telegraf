/**
 * СРАВНИВАЕМ РАЗНЫЕ ВЕРСИИ PAYMENTS_DATA
 * Проверяем - где больше STARS доходов
 */

const fs = require('fs');

console.log('🔍 СРАВНЕНИЕ ВЕРСИЙ PAYMENTS_DATA');
console.log('='.repeat(80));

// Читаем все файлы
const currentData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
const backupNov30 = JSON.parse(fs.readFileSync('payments_data_backup_2025-11-30.json', 'utf-8'));
const backupDec01 = JSON.parse(fs.readFileSync('payments_data_backup_2025-12-01.json', 'utf-8'));

console.log(`📊 РАЗМЕРЫ ФАЙЛОВ:`);
console.log(`   current_data.json: ${currentData.length.toLocaleString()} записей`);
console.log(`   backup_2025-11-30.json: ${backupNov30.length.toLocaleString()} записей`);
console.log(`   backup_2025-12-01.json: ${backupDec01.length.toLocaleString()} записей`);

console.log('\n⭐ ПРОВЕРЯЕМ STARS ДОХОДЫ ПО ФАЙЛАМ:');

// Фильтрующая функция
function getStarsIncome(data) {
  return data.filter(row =>
    row.currency === 'STARS' &&
    row.type === 'MONEY_INCOME' &&
    row.amount > 0 &&
    !row.description?.toUpperCase().includes('TEST_DATA')
  );
}

const starsInCurrent = getStarsIncome(currentData);
const starsInBackupNov30 = getStarsIncome(backupNov30);
const starsInBackupDec01 = getStarsIncome(backupDec01);

console.log(`\n💰 STARS ДОХОДЫ (MONEY_INCOME, без TEST_DATA):`);
console.log(`   current: ${starsInCurrent.length} транзакций`);
console.log(`   backup 2025-11-30: ${starsInBackupNov30.length} транзакций`);
console.log(`   backup 2025-12-01: ${starsInBackupDec01.length} транзакций`);

if (starsInBackupNov30.length > starsInCurrent.length) {
  console.log(`\n⚠️ ВНИМАНИЕ! В бэкапе от 30 ноября больше STARS доходов!`);

  // Показываем разницу
  const currentIds = new Set(starsInCurrent.map(tx => `${tx.telegram_id}-${tx.description}`));
  const backupNovIds = new Set(starsInBackupNov30.map(tx => `${tx.telegram_id}-${tx.description}`));

  const onlyInBackup = starsInBackupNov30.filter(tx => !currentIds.has(`${tx.telegram_id}-${tx.description}`));

  console.log(`\n🔍 ДОПОЛНИТЕЛЬНЫЕ STARS ТРАНЗАКЦИИ (только в бэкапе): ${onlyInBackup.length}`);
  console.log('-'.repeat(80));

  onlyInBackup
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 10)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

      console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
      console.log(`      ${tx.bot_name} | User: ${tx.telegram_id}`);
      console.log(`      ${tx.description.substring(0, 80)}...`);
    });
}

// Проверяем MetaMuse_Manifest_bot в разных файлах
console.log('\n' + '='.repeat(80));
console.log('🤖 ПРОВЕРЯЕМ METAMUSE_MANIFEST_BOT В РАЗНЫХ ФАЙЛАХ:');
console.log('='.repeat(80));

const metamuseCurrent = getStarsIncome(currentData.filter(row => row.bot_name === 'MetaMuse_Manifest_bot'));
const metamuseBackupNov30 = getStarsIncome(backupNov30.filter(row => row.bot_name === 'MetaMuse_Manifest_bot'));

console.log(`\n⭐ STARS ДОХОДЫ MetaMuse_Manifest_bot:`);
console.log(`   current: ${metamuseCurrent.length} транзакций`);
console.log(`   backup 2025-11-30: ${metamuseBackupNov30.length} транзакций`);

if (metamuseBackupNov30.length > metamuseCurrent.length) {
  console.log(`\n⚠️ В БЭКАПЕ БОЛЬШЕ STARS ДОХОДОВ для MetaMuse!`);

  const currentIds = new Set(metamuseCurrent.map(tx => `${tx.telegram_id}-${tx.created_at}`));
  const onlyInBackup = metamuseBackupNov30.filter(tx => !currentIds.has(`${tx.telegram_id}-${tx.created_at}`));

  console.log(`\n🔍 ДОПОЛНИТЕЛЬНЫЕ STARS ТРАНЗАКЦИИ MetaMuse (${onlyInBackup.length}):`);
  onlyInBackup.forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

    console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
    console.log(`      User: ${tx.telegram_id} | ${tx.payment_method}`);
    console.log(`      ${tx.description}`);
  });
}

// Выводим примеры STARS доходов
console.log('\n' + '='.repeat(80));
console.log('📋 ПРИМЕРЫ STARS ДОХОДОВ (current):');
console.log('='.repeat(80));

starsInCurrent
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 5)
  .forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

    console.log(`\n${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
    console.log(`   ${tx.bot_name} | User: ${tx.telegram_id}`);
    console.log(`   ${tx.payment_method} | ${tx.type}`);
    console.log(`   ${tx.description}`);
  });
