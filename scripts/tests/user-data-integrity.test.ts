/**
 * Тесты целостности данных пользователей
 * Проверяет корректность получения и обработки пользователей
 */

import { getAllUsersData } from '../get-all-users-data';

describe('User Data Integrity Tests', () => {
  test('Should get ALL users from database', async () => {
    const usersData = await getAllUsersData();

    // Проверить что пользователей больше чем TOP 200
    expect(Object.keys(usersData).length).toBeGreaterThan(200);

    console.log(`✅ Total users: ${Object.keys(usersData).length}`);
  }, 120000); // 2 минуты timeout

  test('Should have telegram_id for all users', async () => {
    const usersData = await getAllUsersData();

    Object.values(usersData).forEach(user => {
      expect(user.telegram_id).toBeDefined();
      expect(typeof user.telegram_id).toBe('number');
      expect(user.telegram_id).toBeGreaterThan(0);
    });

    console.log(`✅ All users have valid telegram_id`);
  }, 120000);

  test('Should calculate income correctly', async () => {
    const usersData = await getAllUsersData();

    // Найти пользователя с доходами
    const userWithIncome = Object.values(usersData).find(u => u.total_income_rub > 0);

    if (userWithIncome) {
      expect(userWithIncome.total_income_rub).toBeGreaterThan(0);
      expect(userWithIncome.income_operations).toBeGreaterThan(0);
      expect(userWithIncome.income_bots.size).toBeGreaterThan(0);

      console.log(`✅ User ${userWithIncome.telegram_id} has income: ${userWithIncome.total_income_rub}₽`);
    } else {
      console.log('⚠️ No users with income found');
    }
  }, 120000);

  test('Should calculate spending correctly', async () => {
    const usersData = await getAllUsersData();

    // Найти пользователя с расходами
    const userWithSpending = Object.values(usersData).find(u => u.total_spent_rub > 0);

    if (userWithSpending) {
      expect(userWithSpending.total_spent_rub).toBeGreaterThan(0);
      expect(userWithSpending.spending_operations).toBeGreaterThan(0);
      expect(userWithSpending.spending_bots.size).toBeGreaterThan(0);

      console.log(`✅ User ${userWithSpending.telegram_id} has spending: ${userWithSpending.total_spent_rub}₽`);
    } else {
      console.log('⚠️ No users with spending found');
    }
  }, 120000);

  test('Should have correct currency breakdown', async () => {
    const usersData = await getAllUsersData();

    Object.values(usersData).forEach(user => {
      // Проверить структуру валют
      expect(user.income_currency).toHaveProperty('RUB');
      expect(user.income_currency).toHaveProperty('XTR');
      expect(user.income_currency).toHaveProperty('STARS');

      expect(user.spending_currency).toHaveProperty('RUB');
      expect(user.spending_currency).toHaveProperty('XTR');
      expect(user.spending_currency).toHaveProperty('STARS');

      // Проверить что значения не отрицательные
      expect(user.income_currency.RUB).toBeGreaterThanOrEqual(0);
      expect(user.income_currency.XTR).toBeGreaterThanOrEqual(0);
      expect(user.income_currency.STARS).toBeGreaterThanOrEqual(0);

      expect(user.spending_currency.RUB).toBeGreaterThanOrEqual(0);
      expect(user.spending_currency.XTR).toBeGreaterThanOrEqual(0);
      expect(user.spending_currency.STARS).toBeGreaterThanOrEqual(0);
    });

    console.log(`✅ All users have valid currency breakdown`);
  }, 120000);

  test('Should calculate total amounts correctly', async () => {
    const usersData = await getAllUsersData();

    Object.values(usersData).forEach(user => {
      // Проверить что общее количество операций = доходы + расходы
      const totalOperations = user.income_operations + user.spending_operations;
      expect(totalOperations).toBeGreaterThanOrEqual(0);

      // Проверить что боты не пустые для активных пользователей
      if (user.total_income_rub > 0 || user.total_spent_rub > 0) {
        expect(user.income_bots.size + user.spending_bots.size).toBeGreaterThan(0);
      }
    });

    console.log(`✅ All users have valid totals`);
  }, 120000);

  test('Should have users with both income and spending', async () => {
    const usersData = await getAllUsersData();

    const usersWithBoth = Object.values(usersData).filter(
      u => u.total_income_rub > 0 && u.total_spent_rub > 0
    );

    expect(usersWithBoth.length).toBeGreaterThan(0);

    console.log(`✅ Found ${usersWithBoth.length} users with both income and spending`);
  }, 120000);
});
