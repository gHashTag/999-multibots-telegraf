#!/usr/bin/env python3
"""
🔍 ЗАПУСК РЕАЛЬНОГО АНАЛИЗА ФЕЙКОВЫХ ДАННЫХ
Анализирует РЕАЛЬНЫЕ данные из payments_data.json
"""

import json
import os
from detect_fake_data import FakeDataDetector

def load_data():
    """Загружает данные из JSON файла"""
    if not os.path.exists('payments_data.json'):
        print("❌ Файл payments_data.json не найден!")
        return []

    with open('payments_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"✅ Загружено {len(data)} записей из payments_data.json")
    return data

def main():
    """Основная функция анализа"""
    print("\n" + "=" * 70)
    print("🔍 РЕАЛЬНЫЙ АНАЛИЗ ФЕЙКОВЫХ ДАННЫХ")
    print("=" * 70 + "\n")

    # Загружаем данные
    data = load_data()

    if not data:
        print("❌ Нет данных для анализа!")
        return

    # Показываем статистику загрузки
    print(f"\n📊 СТАТИСТИКА ЗАГРУЖКИ:")
    print(f"   Всего записей: {len(data)}")

    # Группируем по ботам
    bots = {}
    for row in data:
        bot = row.get('bot_name', 'unknown')
        if bot not in bots:
            bots[bot] = 0
        bots[bot] += 1

    print(f"   Уникальных ботов: {len(bots)}")
    print(f"\n   ТОП-10 ботов по количеству транзакций:")
    sorted_bots = sorted(bots.items(), key=lambda x: x[1], reverse=True)
    for bot, count in sorted_bots[:10]:
        print(f"     {bot}: {count}")

    # Анализируем данные
    print("\n🔬 Запуск анализа фейковых данных...")
    detector = FakeDataDetector()
    stats = detector.analyze_data(data)

    # Генерируем отчет
    print("\n📊 Генерация отчета...")
    report = detector.generate_report(stats)

    # Сохраняем отчет
    with open('REAL_FAKE_DATA_ANALYSIS_REPORT.txt', 'w', encoding='utf-8') as f:
        f.write(report)

    print(report)

    # Генерируем SQL скрипт
    print("\n🔧 Генерация SQL скрипта очистки...")
    sql_script = detector.generate_sql_clean_script(stats)

    with open('CLEAN_ALL_FAKE_DATA_REAL.sql', 'w', encoding='utf-8') as f:
        f.write(sql_script)

    print("✅ SQL скрипт сохранен в CLEAN_ALL_FAKE_DATA_REAL.sql")

    # Сохраняем статистику
    with open('REAL_fake_data_stats.json', 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print("✅ Статистика сохранена в REAL_fake_data_stats.json")

    # Создаем список подозрительных транзакций
    print("\n🚨 Создание списка фейковых транзакций...")
    fake_transactions = []

    for row in data:
        classification = detector.classify_transaction(row)
        if classification['type'] == 'FAKE':
            fake_transactions.append({
                'bot_name': row.get('bot_name'),
                'payment_method': row.get('payment_method'),
                'description': row.get('description', '')[:100],
                'amount': row.get('amount'),
                'currency': row.get('currency'),
                'type': row.get('type'),
                'reason': classification['reason'],
                'category': classification['category']
            })

    # Сортируем по сумме (фейковые с большими суммами первыми)
    fake_transactions.sort(key=lambda x: abs(x.get('amount', 0)), reverse=True)

    with open('FAKE_TRANSACTIONS_LIST.json', 'w', encoding='utf-8') as f:
        json.dump(fake_transactions, f, indent=2, ensure_ascii=False)

    print(f"✅ Найдено {len(fake_transactions)} фейковых транзакций")
    print(f"   Сохранено в FAKE_TRANSACTIONS_LIST.json")

    # Показываем ТОП-10 фейковых транзакций
    print(f"\n🔴 ТОП-10 ФЕЙКОВЫХ ТРАНЗАКЦИЙ:")
    for i, txn in enumerate(fake_transactions[:10], 1):
        print(f"\n{i}. {txn['bot_name']}")
        print(f"   Сумма: {txn['amount']} {txn['currency']}")
        print(f"   Метод: {txn['payment_method']}")
        print(f"   Тип: {txn['type']}")
        print(f"   Причина: {txn['reason']}")
        if txn['description']:
            print(f"   Описание: {txn['description'][:80]}...")

    # Выводим итоговую сводку
    print("\n" + "=" * 70)
    print("📈 ИТОГОВАЯ СВОДКА АНАЛИЗА:")
    print("=" * 70)
    print(f"Всего транзакций: {stats['total_transactions']:,}")
    print(f"Реальных: {stats['real_transactions']:,} ({stats['real_transactions']/max(stats['total_transactions'],1)*100:.1f}%)")
    print(f"Фейковых: {stats['fake_transactions']:,} ({stats['fake_transactions']/max(stats['total_transactions'],1)*100:.1f}%)")
    print(f"\nРеальные доходы: {stats['real_income_rub']:,.0f}₽")
    print(f"Фейковые доходы: {stats['fake_income_rub']:,.0f}₽")
    print(f"Реальные расходы: {stats['real_expense_rub']:,.0f}₽")
    print(f"Фейковые расходы: {stats['fake_expense_rub']:,.0f}₽")

    print(f"\n🚨 Подозрительных ботов: {len(stats['suspicious_bots'])}")
    for bot in stats['suspicious_bots'][:5]:
        print(f"  - {bot['bot']}: {bot['fake_ratio']*100:.1f}% фейка ({bot['fake_transactions']} фейк / {bot['real_transactions']} реал)")

    print("\n" + "=" * 70)
    print("✅ АНАЛИЗ ЗАВЕРШЕН!")
    print("=" * 70)
    print("\n📁 Созданные файлы:")
    print("  1. REAL_FAKE_DATA_ANALYSIS_REPORT.txt - полный отчет")
    print("  2. CLEAN_ALL_FAKE_DATA_REAL.sql - скрипт очистки БД")
    print("  3. REAL_fake_data_stats.json - статистика")
    print("  4. FAKE_TRANSACTIONS_LIST.json - список фейковых транзакций")

if __name__ == "__main__":
    main()
