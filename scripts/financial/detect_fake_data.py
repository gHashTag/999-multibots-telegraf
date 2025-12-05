#!/usr/bin/env python3
"""
🔍 СКРИПТ АВТОМАТИЧЕСКОГО ПОИСКА ФЕЙКОВЫХ ДАННЫХ
Анализирует все транзакции в payments_v2 и находит фейковые данные
"""

import json
from typing import Dict, List, Any

# Курсы конвертации
RATES = {
    'XTR': 1.8,
    'STARS': 1.8,
    'RUB': 1.0,
    'SYSTEM': 1.0  # для SYSTEM валюты
}

class FakeDataDetector:
    def __init__(self):
        # Критерии определения фейковых данных
        self.fake_payment_methods = [
            'SYSTEM', 'Manual', 'Tester_Bonus', 'System_Balance_Migration',
            'System_Operation', 'Admin', 'admin', 'video-generation-refund',
            'image-to-video-refund', 'balance'
        ]

        self.real_payment_methods = [
            'Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay',
            'SberPay', 'Банковская карта', 'RUR Банковская карта'
        ]

        # Тестовые боты (исключаются полностью)
        self.test_bots = [
            'ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script',
            'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot'
        ]

    def classify_transaction(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Классифицирует транзакцию как РЕАЛЬНУЮ или ФЕЙКОВУЮ"""

        bot_name = row.get('bot_name', '')
        payment_method = row.get('payment_method', '')
        description = row.get('description', '')
        amount = float(row.get('amount', 0) or 0)

        # Бот из списка тестовых ботов
        if bot_name in self.test_bots:
            return {
                'type': 'FAKE',
                'reason': f'Тестовый бот ({bot_name})',
                'category': 'TEST_BOT'
            }

        # Описание содержит TEST_DATA
        if 'TEST_DATA' in description:
            return {
                'type': 'FAKE',
                'reason': 'Описание содержит TEST_DATA',
                'category': 'TEST_DATA_IN_DESC'
            }

        # Payment method из списка фейковых
        if payment_method in self.fake_payment_methods:
            return {
                'type': 'FAKE',
                'reason': f'Фейковый метод оплаты ({payment_method})',
                'category': 'FAKE_PAYMENT_METHOD'
            }

        # Проверяем на реальный payment method
        if any(real_method in payment_method for real_method in self.real_payment_methods):
            return {
                'type': 'REAL',
                'reason': 'Реальный метод оплаты',
                'category': 'REAL_PAYMENT'
            }

        # Неопределенные - считаем фейковыми для безопасности
        return {
            'type': 'FAKE',
            'reason': f'Неопределенный метод оплаты ({payment_method})',
            'category': 'UNKNOWN_METHOD'
        }

    def convert_to_rub(self, amount: float, currency: str) -> float:
        """Конвертирует сумму в рубли"""
        rate = RATES.get(currency, 1.0)
        return amount * rate

    def analyze_data(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Анализирует данные и возвращает статистику"""

        stats = {
            'total_transactions': len(data),
            'real_transactions': 0,
            'fake_transactions': 0,
            'real_income_rub': 0,
            'fake_income_rub': 0,
            'real_expense_rub': 0,
            'fake_expense_rub': 0,
            'by_bot': {},
            'by_category': {},
            'suspicious_bots': [],
            'fake_methods': {},
            'clean_data': [],
            'fake_data': []
        }

        for row in data:
            classification = self.classify_transaction(row)
            row['classification'] = classification

            currency = row.get('currency', 'RUB')
            amount = float(row.get('amount', 0) or 0)
            type_ = row.get('type', '')
            rub_amount = self.convert_to_rub(amount, currency)

            bot_name = row.get('bot_name', 'unknown')

            # Подсчет по типам
            if classification['type'] == 'REAL':
                stats['real_transactions'] += 1
                if type_ == 'MONEY_INCOME':
                    stats['real_income_rub'] += rub_amount
                elif type_ == 'MONEY_OUTCOME':
                    stats['real_expense_rub'] += rub_amount
                stats['clean_data'].append(row)
            else:
                stats['fake_transactions'] += 1
                if type_ == 'MONEY_INCOME':
                    stats['fake_income_rub'] += rub_amount
                elif type_ == 'MONEY_OUTCOME':
                    stats['fake_expense_rub'] += rub_amount
                stats['fake_data'].append(row)

            # Статистика по ботам
            if bot_name not in stats['by_bot']:
                stats['by_bot'][bot_name] = {
                    'total_transactions': 0,
                    'real_transactions': 0,
                    'fake_transactions': 0,
                    'real_income': 0,
                    'fake_income': 0,
                    'real_expense': 0,
                    'fake_expense': 0
                }

            bot_stats = stats['by_bot'][bot_name]
            bot_stats['total_transactions'] += 1

            if classification['type'] == 'REAL':
                bot_stats['real_transactions'] += 1
                if type_ == 'MONEY_INCOME':
                    bot_stats['real_income'] += rub_amount
                elif type_ == 'MONEY_OUTCOME':
                    bot_stats['real_expense'] += rub_amount
            else:
                bot_stats['fake_transactions'] += 1
                if type_ == 'MONEY_INCOME':
                    bot_stats['fake_income'] += rub_amount
                elif type_ == 'MONEY_OUTCOME':
                    bot_stats['fake_expense'] += rub_amount

            # Статистика по категориям
            category = classification['category']
            if category not in stats['by_category']:
                stats['by_category'][category] = 0
            stats['by_category'][category] += 1

            # Подозрительные боты (больше фейка чем реального)
            fake_ratio = bot_stats['fake_transactions'] / max(bot_stats['total_transactions'], 1)
            if fake_ratio > 0.5 and bot_stats['total_transactions'] > 10:
                stats['suspicious_bots'].append({
                    'bot': bot_name,
                    'fake_ratio': fake_ratio,
                    'fake_transactions': bot_stats['fake_transactions'],
                    'real_transactions': bot_stats['real_transactions']
                })

            # Фейковые методы оплаты
            if classification['type'] == 'FAKE':
                method = row.get('payment_method', 'unknown')
                if method not in stats['fake_methods']:
                    stats['fake_methods'][method] = 0
                stats['fake_methods'][method] += 1

        return stats

    def generate_sql_clean_script(self, stats: Dict[str, Any]) -> str:
        """Генерирует SQL скрипт для очистки данных"""

        sql = """-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ФЕЙКОВЫХ ДАННЫХ
-- Сгенерировано скриптом detect_fake_data.py
-- =====================================================

-- ШАГ 1: Помечаем фейковые данные тегом
UPDATE payments_v2
SET description = 'FAKE_DATA: ' || description
WHERE (
  -- Критерий 1: Описание содержит TEST_DATA
  description LIKE '%TEST_DATA%'
  OR
  -- Критерий 2: Фейковые методы оплаты
  payment_method IN ('SYSTEM', 'Manual', 'Tester_Bonus', 'System_Balance_Migration', 'System_Operation', 'Admin', 'admin', 'video-generation-refund', 'image-to-video-refund', 'balance')
  OR
  -- Критерий 3: Тестовые боты
  bot_name IN ('ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script', 'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot')
);

-- ШАГ 2: Создаем индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_payments_fake_data
ON payments_v2 (description)
WHERE description LIKE 'FAKE_DATA:%';

-- ШАГ 3: Создаем VIEW только с реальными данными
CREATE OR REPLACE VIEW clean_real_data AS
SELECT *
FROM payments_v2
WHERE description NOT LIKE 'FAKE_DATA:%'
  AND payment_method IN ('Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay', 'Банковская карта', 'RUR Банковская карта')
  AND bot_name NOT IN ('ai_koshey_bot', 'admin_system', 'admin_grant', 'admin_script', 'clip_maker_neuro_bot', 'diagnostic_test', 'test_bot');

-- ШАГ 4: Создаем VIEW с фейковыми данными (для QA)
CREATE OR REPLACE VIEW fake_data_for_qa AS
SELECT *
FROM payments_v2
WHERE description LIKE 'FAKE_DATA:%';

-- ШАГ 5: Статистика очистки
SELECT
  'СТАТИСТИКА ОЧИСТКИ' as section,
  '' as details
UNION ALL
SELECT
  'Реальных транзакций',
  COUNT(*)::text || ' записей'
FROM clean_real_data
UNION ALL
SELECT
  'Фейковых транзакций',
  COUNT(*)::text || ' записей'
FROM fake_data_for_qa
UNION ALL
SELECT
  'Общий баланс (реальные)',
  SUM(CASE WHEN type = 'MONEY_INCOME' THEN amount::numeric ELSE 0 END)::text || '₽'
FROM clean_real_data;

"""

        return sql

    def generate_report(self, stats: Dict[str, Any]) -> str:
        """Генерирует текстовый отчет"""

        report = f"""
🔍 ОТЧЕТ ПО ФЕЙКОВЫМ ДАННЫМ
{'=' * 60}

📊 ОБЩАЯ СТАТИСТИКА:
- Всего транзакций: {stats['total_transactions']:,}
- Реальных: {stats['real_transactions']:,} ({stats['real_transactions']/max(stats['total_transactions'],1)*100:.1f}%)
- Фейковых: {stats['fake_transactions']:,} ({stats['fake_transactions']/max(stats['total_transactions'],1)*100:.1f}%)

💰 ФИНАНСОВАЯ СТАТИСТИКА (в рублях):
- Реальные доходы: {stats['real_income_rub']:,.0f}₽
- Фейковые доходы: {stats['fake_income_rub']:,.0f}₽
- Реальные расходы: {stats['real_expense_rub']:,.0f}₽
- Фейковые расходы: {stats['fake_expense_rub']:,.0f}₽

⚖️ ЧИСТЫЙ РЕЗУЛЬТАТ:
- Реальная прибыль: {stats['real_income_rub'] - stats['real_expense_rub']:,.0f}₽
- Фейковая прибыль: {stats['fake_income_rub'] - stats['fake_expense_rub']:,.0f}₽

🚨 ПОДОЗРИТЕЛЬНЫЕ БОТЫ (>50% фейка):
"""

        for bot in stats['suspicious_bots'][:10]:
            report += f"- {bot['bot']}: {bot['fake_ratio']*100:.1f}% фейка ({bot['fake_transactions']} фейк / {bot['real_transactions']} реал)\n"

        report += f"""
🚫 ФЕЙКОВЫЕ МЕТОДЫ ОПЛАТЫ:
"""
        for method, count in sorted(stats['fake_methods'].items(), key=lambda x: x[1], reverse=True)[:10]:
            report += f"- {method}: {count:,} транзакций\n"

        report += f"""
📈 ТОП-10 БОТОВ ПО ФЕЙКОВЫМ ДАННЫМ:
"""
        sorted_bots = sorted(stats['by_bot'].items(), key=lambda x: x[1]['fake_income'], reverse=True)[:10]
        for bot_name, bot_stats in sorted_bots:
            if bot_stats['fake_income'] > 0:
                report += f"- {bot_name}: {bot_stats['fake_income']:,.0f}₽ фейк, {bot_stats['real_income']:,.0f}₽ реал\n"

        return report

def main():
    """Основная функция"""

    # Загружаем данные из JSON (эмуляция данных из Supabase)
    print("🔍 Запуск анализа фейковых данных...")
    print("⚠️  ВАЖНО: Подключите скрипт к Supabase для получения реальных данных")
    print("📝 Этот скрипт показывает структуру анализа.")
    print("\nДля работы скрипта нужно:")
    print("1. Подключиться к Supabase")
    print("2. Загрузить все данные из payments_v2")
    print("3. Запустить analyze_data()")
    print("4. Сгенерировать SQL скрипт очистки")

    # Пример данных
    example_data = [
        {
            'bot_name': 'neuro_blogger_bot',
            'payment_method': 'Telegram',
            'description': 'Payment via Telegram',
            'amount': 1000,
            'currency': 'RUB',
            'type': 'MONEY_INCOME'
        },
        {
            'bot_name': 'ai_koshey_bot',
            'payment_method': 'SYSTEM',
            'description': 'TEST_DATA: System/Bonus/Testing | TAG:TEST_DATA',
            'amount': 65000000,
            'currency': 'STARS',
            'type': 'MONEY_INCOME'
        }
    ]

    detector = FakeDataDetector()
    stats = detector.analyze_data(example_data)

    print("\n📊 ПРИМЕР АНАЛИЗА:")
    print(detector.generate_report(stats))

    print("\n🔧 СГЕНЕРИРОВАННЫЙ SQL:")
    print(detector.generate_sql_clean_script(stats)[:500] + "...")

if __name__ == "__main__":
    main()
