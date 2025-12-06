#!/usr/bin/env python3
"""
🔍 ЗАПУСК АНАЛИЗА ФЕЙКОВЫХ ДАННЫХ
Подключается к Supabase и анализирует ВСЕ транзакции
"""

import os
import json
from typing import List, Dict, Any
from detect_fake_data import FakeDataDetector

# Supabase connection parameters
SUPABASE_URL = "https://fbgmxbvzwgxfkagxkmqc.supabase.co"
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

def get_supabase_data() -> List[Dict[str, Any]]:
    """
    Получает все данные из payments_v2 через Supabase REST API
    """
    import requests

    if not SUPABASE_SERVICE_KEY:
        print("⚠️  SUPABASE_SERVICE_KEY не найден в переменных окружения")
        print("💡 Попытка загрузки из файла...")

        # Пытаемся загрузить из JSON файла
        try:
            with open('payments_data.json', 'r') as f:
                data = json.load(f)
                print(f"✅ Загружено {len(data)} записей из файла")
                return data
        except FileNotFoundError:
            print("❌ Файл payments_data.json не найден")

        return []

    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json'
    }

    # Получаем все данные из payments_v2
    url = f"{SUPABASE_URL}/rest/v1/payments_v2?select=*"
    print(f"🔌 Подключение к Supabase: {SUPABASE_URL}")
    print("📥 Загрузка данных из payments_v2...")

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()

        print(f"✅ Загружено {len(data)} записей из базы данных")

        # Сохраняем в файл для кэширования
        with open('payments_data.json', 'w') as f:
            json.dump(data, f, indent=2)
        print("💾 Данные сохранены в payments_data.json")

        return data

    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка подключения к Supabase: {e}")
        return []

def analyze_fake_data():
    """
    Основная функция анализа фейковых данных
    """
    print("\n" + "=" * 70)
    print("🔍 АВТОМАТИЧЕСКИЙ АНАЛИЗ ФЕЙКОВЫХ ДАННЫХ")
    print("=" * 70)

    # Получаем данные
    data = get_supabase_data()

    if not data:
        print("❌ Нет данных для анализа!")
        return

    # Создаем детектор
    detector = FakeDataDetector()

    # Анализируем данные
    print("\n🔬 Запуск анализа...")
    stats = detector.analyze_data(data)

    # Генерируем отчет
    print("\n📊 Генерация отчета...")
    report = detector.generate_report(stats)

    # Сохраняем отчет
    with open('fake_data_analysis_report.txt', 'w', encoding='utf-8') as f:
        f.write(report)

    print(report)

    # Генерируем SQL скрипт очистки
    print("\n🔧 Генерация SQL скрипта очистки...")
    sql_script = detector.generate_sql_clean_script(stats)

    with open('CLEAN_ALL_FAKE_DATA.sql', 'w', encoding='utf-8') as f:
        f.write(sql_script)

    print("✅ SQL скрипт сохранен в CLEAN_ALL_FAKE_DATA.sql")

    # Сохраняем статистику в JSON
    with open('fake_data_stats.json', 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print("✅ Статистика сохранена в fake_data_stats.json")

    # Выводим краткую сводку
    print("\n" + "=" * 70)
    print("📈 КРАТКАЯ СВОДКА:")
    print("=" * 70)
    print(f"Всего транзакций: {stats['total_transactions']:,}")
    print(f"Реальных: {stats['real_transactions']:,} ({stats['real_transactions']/max(stats['total_transactions'],1)*100:.1f}%)")
    print(f"Фейковых: {stats['fake_transactions']:,} ({stats['fake_transactions']/max(stats['total_transactions'],1)*100:.1f}%)")
    print(f"\nРеальные доходы: {stats['real_income_rub']:,.0f}₽")
    print(f"Фейковые доходы: {stats['fake_income_rub']:,.0f}₽")
    print(f"Реальные расходы: {stats['real_expense_rub']:,.0f}₽")
    print(f"Фейковые расходы: {stats['fake_expense_rub']:,.0f}₽")

    if stats['suspicious_bots']:
        print(f"\n🚨 Подозрительных ботов: {len(stats['suspicious_bots'])}")
        for bot in stats['suspicious_bots'][:5]:
            print(f"  - {bot['bot']}: {bot['fake_ratio']*100:.1f}% фейка")

    print("\n" + "=" * 70)
    print("✅ АНАЛИЗ ЗАВЕРШЕН!")
    print("=" * 70)
    print("\n📁 Созданные файлы:")
    print("  1. fake_data_analysis_report.txt - полный отчет")
    print("  2. CLEAN_ALL_FAKE_DATA.sql - скрипт очистки БД")
    print("  3. fake_data_stats.json - статистика в JSON")
    print("  4. payments_data.json - кэш данных")

if __name__ == "__main__":
    analyze_fake_data()
