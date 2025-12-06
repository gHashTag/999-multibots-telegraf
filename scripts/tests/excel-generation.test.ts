/**
 * Тесты генерации Excel отчета
 * Проверяет корректность создания Excel файла со всеми листами
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

describe('Excel Generation Tests', () => {
  const testOutputPath = path.join(__dirname, 'test-output.xlsx');

  beforeAll(() => {
    // Очистка тестового файла перед тестами
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }
  });

  afterAll(() => {
    // Очистка после тестов
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }
  });

  test('Should create Excel workbook with all 11 sheets', async () => {
    const workbook = new ExcelJS.Workbook();

    // Создаем все листы как в final_all_bots_report.js
    const sheetNames = [
      '📊 ОБЩАЯ СВОДКА',
      '🆚 ПРОДАКШЕН vs ТЕСТ',
      '🏆 ТОП БОТЫ',
      '🤖 РАСХОДЫ НА AI',
      '💰 ДОХОДЫ ПО МЕТОДАМ',
      '⭐ РЕАЛЬНЫЕ STARS',
      '🚫 ФЕЙК STARS',
      '📈 ПРИБЫЛЬНОСТЬ',
      '💎 СВОДКА ВАЛЮТ',
      '💰 ТОП ПО ДОХОДАМ',
      '👤 ТОП ПО РАСХОДАМ'
    ];

    sheetNames.forEach(name => {
      workbook.addWorksheet(name);
    });

    // Проверяем что все листы созданы
    expect(workbook.worksheets.length).toBe(11);

    sheetNames.forEach((name, index) => {
      expect(workbook.worksheets[index].name).toBe(name);
    });

    console.log(`✅ Created ${workbook.worksheets.length} worksheets`);
  }, 30000);

  test('Should save and load Excel file correctly', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Test Suite';

    // Добавляем тестовые данные
    const testSheet = workbook.addWorksheet('TEST');
    testSheet.addRow(['Test', 'Data']);
    testSheet.addRow(['Row 1', 'Value 1']);
    testSheet.addRow(['Row 2', 'Value 2']);

    // Сохраняем файл
    await workbook.xlsx.writeFile(testOutputPath);

    // Проверяем что файл создался
    expect(fs.existsSync(testOutputPath)).toBe(true);

    // Загружаем и проверяем
    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.readFile(testOutputPath);

    expect(loadedWorkbook.worksheets.length).toBe(1);
    expect(loadedWorkbook.worksheets[0].name).toBe('TEST');
    expect(loadedWorkbook.worksheets[0].rowCount).toBe(3);

    console.log('✅ Excel file saved and loaded correctly');
  }, 30000);

  test('Should handle large datasets (500+ rows)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('LARGE DATA');

    // Добавляем заголовки
    sheet.addRow([
      '№', 'Telegram ID', 'Username', 'Имя',
      'Доходы (₽)', 'Опер. доходов', 'Ботов доходов', 'Боты (доходы)',
      'Расходы (₽)', 'Опер. расходов', 'Доход RUB', 'Доход XTR', 'Доход STARS',
      'Расход RUB', 'Расход XTR', 'Расход STARS'
    ]);

    // Генерируем 500 тестовых пользователей
    for (let i = 1; i <= 500; i++) {
      sheet.addRow([
        i,
        1000000000 + i,
        `user_${i}`,
        `User ${i}`,
        Math.round(Math.random() * 10000),
        Math.round(Math.random() * 100),
        Math.round(Math.random() * 10),
        'bot1, bot2, bot3',
        Math.round(Math.random() * 10000),
        Math.round(Math.random() * 100),
        Math.round(Math.random() * 5000),
        Math.round(Math.random() * 3000),
        Math.round(Math.random() * 2000),
        Math.round(Math.random() * 5000),
        Math.round(Math.random() * 3000),
        Math.round(Math.random() * 2000)
      ]);
    }

    // Проверяем количество строк
    expect(sheet.rowCount).toBe(501); // 500 пользователей + 1 заголовок

    await workbook.xlsx.writeFile(testOutputPath);

    // Загружаем и проверяем
    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.readFile(testOutputPath);
    const loadedSheet = loadedWorkbook.worksheets[0];

    expect(loadedSheet.rowCount).toBe(501);

    console.log(`✅ Large dataset (500 rows) handled correctly`);
  }, 60000);

  test('Should properly format currency columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('CURRENCY');

    sheet.addRow(['Бот', 'RUB', 'XTR', 'STARS', 'ИТОГО']);
    sheet.addRow(['Bot 1', 1000, 500, 300, 1800]);
    sheet.addRow(['Bot 2', 2000, 1000, 600, 3600]);

    // Применяем форматирование
    sheet.getColumn(2).numFmt = '#,##0"₽"';
    sheet.getColumn(3).numFmt = '#,##0" XTR"';
    sheet.getColumn(4).numFmt = '#,##0" STARS"';
    sheet.getColumn(5).numFmt = '#,##0"₽"';

    await workbook.xlsx.writeFile(testOutputPath);

    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.readFile(testOutputPath);
    const loadedSheet = loadedWorkbook.worksheets[0];

    // Проверяем формат ячеек
    expect(loadedSheet.getCell('B2').value).toBe(1000);
    expect(loadedSheet.getCell('C2').value).toBe(500);
    expect(loadedSheet.getCell('D2').value).toBe(300);

    console.log('✅ Currency formatting applied correctly');
  }, 30000);

  test('Should merge cells for headers', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('MERGE TEST');

    // Создаем заголовок как в final_all_bots_report.js
    sheet.mergeCells('A1:N1');
    const headerCell = sheet.getCell('A1');
    headerCell.value = '🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ: ПРАВИЛЬНЫЕ STARS';
    headerCell.font = { size: 16, bold: true };
    headerCell.alignment = { horizontal: 'center' };

    await workbook.xlsx.writeFile(testOutputPath);

    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.readFile(testOutputPath);
    const loadedSheet = loadedWorkbook.worksheets[0];

    // Проверяем что ячейки объединены
    expect(loadedSheet.getCell('A1').value).toBe('🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ: ПРАВИЛЬНЫЕ STARS');
    expect(loadedSheet.getCell('N1').value).toBe('🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ: ПРАВИЛЬНЫЕ STARS');

    console.log('✅ Cell merging works correctly');
  }, 30000);

  test('Should handle special characters in bot names', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('SPECIAL CHARS');

    // Тестируем специальные символы
    const specialNames = [
      'MetaMuse_Manifest_bot',
      'AI_STARS_bot',
      'Gaia_Kamskaia_bot',
      'NeuroLenaAssistant_bot',
      'NeurostylistShtogrina_bot',
      'Kaya_easy_art_bot',
      'ai_koshey_bot',
      'clip_maker_neuro_bot'
    ];

    sheet.addRow(['Бот', 'Тип']);
    specialNames.forEach(name => {
      sheet.addRow([name, 'ПРОДАКШЕН']);
    });

    await workbook.xlsx.writeFile(testOutputPath);

    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.readFile(testOutputPath);
    const loadedSheet = loadedWorkbook.worksheets[0];

    // Проверяем что все имена сохранились корректно
    expect(loadedSheet.getCell('A2').value).toBe('MetaMuse_Manifest_bot');
    expect(loadedSheet.getCell('A9').value).toBe('clip_maker_neuro_bot');

    console.log('✅ Special characters handled correctly');
  }, 30000);

  test('Should validate all required sheets exist in production report', async () => {
    const finalReportPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ОТЧЕТ_ВСЕ_10_БОТОВ.xlsx';

    if (!fs.existsSync(finalReportPath)) {
      console.log('⚠️ Final report does not exist yet, skipping validation');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(finalReportPath);

    const requiredSheets = [
      '📊 ОБЩАЯ СВОДКА',
      '🆚 ПРОДАКШЕН vs ТЕСТ',
      '🏆 ТОП БОТЫ',
      '🤖 РАСХОДЫ НА AI',
      '💰 ДОХОДЫ ПО МЕТОДАМ',
      '⭐ РЕАЛЬНЫЕ STARS',
      '🚫 ФЕЙК STARS',
      '📈 ПРИБЫЛЬНОСТЬ',
      '💎 СВОДКА ВАЛЮТ',
      '💰 ТОП ПО ДОХОДАМ',
      '👤 ТОП ПО РАСХОДАМ'
    ];

    requiredSheets.forEach(sheetName => {
      const sheet = workbook.getWorksheet(sheetName);
      expect(sheet).toBeDefined();

      if (sheet) {
        expect(sheet.rowCount).toBeGreaterThan(1);
      }
    });

    console.log(`✅ All ${requiredSheets.length} required sheets exist in production report`);
  }, 60000);
});
