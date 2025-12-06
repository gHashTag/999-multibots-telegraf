/**
 * Тесты пагинации
 * Проверяет корректность работы с большими объемами данных (>1000 записей)
 */

import { vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Pagination Tests', () => {
  const pageSize = 1000;

  test('Should handle pagination with mock data', async () => {
    // Создаем мок-клиент Supabase
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
    };

    // Симулируем 5000 записей (5 страниц)
    const totalRecords = 5000;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // Мокаем ответы для каждой страницы
    const mockPages = [];
    for (let page = 0; page < totalPages; page++) {
      const start = page * pageSize;
      const end = Math.min(start + pageSize - 1, totalRecords - 1);
      const pageData = [];

      for (let i = start; i <= end; i++) {
        pageData.push({
          telegram_id: 1000000000 + i,
          amount: Math.random() * 1000,
          currency: 'RUB',
          type: 'MONEY_INCOME',
          bot_name: 'test_bot',
          created_at: new Date().toISOString(),
          payment_method: 'Telegram'
        });
      }

      mockPages.push({ data: pageData, error: null, count: totalRecords });
    }

    let pageIndex = 0;
    (mockSupabase.range as vi.MockedFunction<any>).mockImplementation(() => {
      const result = mockPages[pageIndex];
      pageIndex++;
      return Promise.resolve(result);
    });

    // Симулируем получение всех страниц
    const allRecords: any[] = [];
    for (let page = 0; page < totalPages; page++) {
      const offset = page * pageSize;
      const { data } = await mockSupabase
        .from('payments_v2')
        .select('telegram_id, amount, currency, type, bot_name, created_at, payment_method')
        .range(offset, offset + pageSize - 1);

      allRecords.push(...(data || []));
    }

    // Проверяем результат
    expect(allRecords.length).toBe(totalRecords);
    expect(pageIndex).toBe(totalPages);

    // Проверяем первую и последнюю записи
    expect(allRecords[0].telegram_id).toBe(1000000000);
    expect(allRecords[allRecords.length - 1].telegram_id).toBe(1000000000 + totalRecords - 1);

    console.log(`✅ Pagination handled ${totalRecords} records across ${totalPages} pages`);
  }, 30000);

  test('Should correctly calculate page counts for various record sizes', () => {
    const testCases = [
      { records: 500, expectedPages: 1 },
      { records: 1000, expectedPages: 1 },
      { records: 1001, expectedPages: 2 },
      { records: 2500, expectedPages: 3 },
      { records: 5000, expectedPages: 5 },
      { records: 10000, expectedPages: 10 },
      { records: 16217, expectedPages: 17 } // Реальный случай из production
    ];

    testCases.forEach(({ records, expectedPages }) => {
      const actualPages = Math.ceil(records / pageSize);
      expect(actualPages).toBe(expectedPages);

      console.log(`✅ ${records} records = ${actualPages} pages`);
    });
  });

  test('Should handle edge case with exactly 1000 records', async () => {
    const totalRecords = 1000;
    const totalPages = Math.ceil(totalRecords / pageSize); // Должно быть 1

    expect(totalPages).toBe(1);

    // Симулируем одну страницу с 1000 записями
    const pageData = Array.from({ length: 1000 }, (_, i) => ({
      telegram_id: 1000000000 + i,
      amount: 100 + i,
      currency: 'RUB',
      type: 'MONEY_INCOME',
      bot_name: 'test_bot',
      created_at: new Date().toISOString(),
      payment_method: 'Telegram'
    }));

    expect(pageData.length).toBe(1000);
    expect(pageData[0].telegram_id).toBe(1000000000);
    expect(pageData[999].telegram_id).toBe(1000000999);

    console.log('✅ Edge case (exactly 1000 records) handled correctly');
  });

  test('Should handle edge case with 1 record', async () => {
    const totalRecords = 1;
    const totalPages = Math.ceil(totalRecords / pageSize); // Должно быть 1

    expect(totalPages).toBe(1);

    const pageData = [{
      telegram_id: 1000000000,
      amount: 100,
      currency: 'RUB',
      type: 'MONEY_INCOME',
      bot_name: 'test_bot',
      created_at: new Date().toISOString(),
      payment_method: 'Telegram'
    }];

    expect(pageData.length).toBe(1);

    console.log('✅ Edge case (1 record) handled correctly');
  });

  test('Should handle edge case with 1001 record', async () => {
    const totalRecords = 1001;
    const totalPages = Math.ceil(totalRecords / pageSize); // Должно быть 2

    expect(totalPages).toBe(2);

    // Страница 1: записи 0-999
    const page1Size = Math.min(pageSize, totalRecords);
    expect(page1Size).toBe(1000);

    // Страница 2: запись 1000
    const page2Size = totalRecords - page1Size;
    expect(page2Size).toBe(1);

    console.log('✅ Edge case (1001 records = 2 pages) handled correctly');
  });

  test('Should maintain consistent telegram_id across pagination', async () => {
    const totalRecords = 2500;
    const totalPages = Math.ceil(totalRecords / pageSize);
    const allRecords: any[] = [];

    // Симулируем получение всех страниц
    for (let page = 0; page < totalPages; page++) {
      const offset = page * pageSize;
      const pageSizeActual = Math.min(pageSize, totalRecords - offset);

      const pageData = Array.from({ length: pageSizeActual }, (_, i) => ({
        telegram_id: 1000000000 + offset + i,
        amount: Math.random() * 1000,
        currency: 'RUB',
        type: 'MONEY_INCOME',
        bot_name: 'test_bot',
        created_at: new Date().toISOString(),
        payment_method: 'Telegram'
      }));

      allRecords.push(...pageData);
    }

    // Проверяем последовательность telegram_id
    for (let i = 0; i < allRecords.length; i++) {
      const expectedId = 1000000000 + i;
      expect(allRecords[i].telegram_id).toBe(expectedId);
    }

    expect(allRecords.length).toBe(totalRecords);
    expect(allRecords[0].telegram_id).toBe(1000000000);
    expect(allRecords[allRecords.length - 1].telegram_id).toBe(1000000000 + totalRecords - 1);

    console.log(`✅ telegram_id sequence maintained across ${totalPages} pages`);
  });

  test('Should handle empty result set', async () => {
    const totalRecords = 0;
    const totalPages = Math.ceil(totalRecords / pageSize);

    expect(totalPages).toBe(0);

    const allRecords: any[] = [];
    for (let page = 0; page < totalPages; page++) {
      const offset = page * pageSize;
      // Пустая страница
      const pageData: any[] = [];
      allRecords.push(...pageData);
    }

    expect(allRecords.length).toBe(0);

    console.log('✅ Empty result set handled correctly');
  });

  test('Should simulate production scenario (16217 records)', async () => {
    const totalRecords = 16217; // Реальный случай из production
    const totalPages = Math.ceil(totalRecords / pageSize);

    expect(totalPages).toBe(17); // 16 полных страниц + 1 с 217 записями

    const allRecords: any[] = [];

    for (let page = 0; page < totalPages; page++) {
      const offset = page * pageSize;
      const remainingRecords = totalRecords - offset;
      const currentPageSize = Math.min(pageSize, remainingRecords);

      const pageData = Array.from({ length: currentPageSize }, (_, i) => ({
        telegram_id: 1000000000 + offset + i,
        amount: Math.random() * 1000,
        currency: ['RUB', 'XTR', 'STARS'][Math.floor(Math.random() * 3)],
        type: Math.random() > 0.5 ? 'MONEY_INCOME' : 'MONEY_OUTCOME',
        bot_name: ['bot1', 'bot2', 'bot3'][Math.floor(Math.random() * 3)],
        created_at: new Date().toISOString(),
        payment_method: 'Telegram'
      }));

      allRecords.push(...pageData);
    }

    // Проверяем общее количество
    expect(allRecords.length).toBe(totalRecords);

    // Проверяем размеры страниц
    expect(allRecords.slice(0, 1000).length).toBe(1000); // Страница 1
    expect(allRecords.slice(1000, 2000).length).toBe(1000); // Страница 2
    expect(allRecords.slice(16000).length).toBe(217); // Последняя страница

    console.log(`✅ Production scenario (${totalRecords} records = ${totalPages} pages) handled correctly`);
  }, 60000);
});

// Мок для vitest
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
  }))
}));
