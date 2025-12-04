#!/usr/bin/env python3
"""
🔌 ПОЛУЧЕНИЕ ДАННЫХ ИЗ SUPABASE
Использует Infisical для получения ключей и загрузки всех транзакций
"""

import os
import sys
import json
import subprocess

def get_infisical_secrets():
    """Получает секреты через CLI Infisical"""
    try:
        # Пытаемся получить через CLI
        result = subprocess.run(
            ['infisical', 'secrets', '--projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3', '--env=dev'],
            capture_output=True,
            text=True,
            check=True
        )

        secrets = {}
        for line in result.stdout.split('\n'):
            if '=' in line:
                key, value = line.split('=', 1)
                secrets[key] = value

        return secrets

    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"⚠️  CLI Infisical недоступен: {e}")
        return None

def get_supabase_data():
    """Загружает все данные из payments_v2"""
    import requests

    # Пытаемся получить секреты
    secrets = get_infisical_secrets()

    if not secrets:
        print("❌ Не удалось получить секреты")
        return []

    supabase_key = secrets.get('SUPABASE_SERVICE_KEY')
    supabase_url = secrets.get('SUPABASE_URL')

    if not supabase_key or not supabase_url:
        print("❌ SUPABASE_SERVICE_KEY или SUPABASE_URL не найдены")
        return []

    print(f"✅ Получены ключи Supabase")
    print(f"   URL: {supabase_url}")

    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json'
    }

    # Параметры запроса для получения всех данных
    url = f"{supabase_url}/rest/v1/payments_v2"
    print(f"📥 Загрузка данных из {url}...")

    try:
        response = requests.get(url, headers=headers, params={'select': '*'})
        response.raise_for_status()
        data = response.json()

        print(f"✅ Загружено {len(data)} записей")

        # Преобразуем данные в нужный формат
        formatted_data = []
        for row in data:
            formatted_data.append({
                'bot_name': row.get('bot_name', ''),
                'payment_method': row.get('payment_method', ''),
                'description': row.get('description', ''),
                'amount': float(row.get('amount', 0) or 0),
                'currency': row.get('currency', 'RUB'),
                'type': row.get('type', ''),
                'created_at': row.get('created_at', '')
            })

        # Сохраняем данные
        with open('payments_data.json', 'w', encoding='utf-8') as f:
            json.dump(formatted_data, f, indent=2, ensure_ascii=False)

        print(f"💾 Данные сохранены в payments_data.json")

        # Выводим статистику
        print(f"\n📊 СТАТИСТИКА:")
        bots = {}
        for row in formatted_data:
            bot = row['bot_name']
            if bot not in bots:
                bots[bot] = 0
            bots[bot] += 1

        for bot, count in sorted(bots.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"   {bot}: {count} транзакций")

        return formatted_data

    except Exception as e:
        print(f"❌ Ошибка загрузки данных: {e}")
        import traceback
        traceback.print_exc()
        return []

def main():
    print("\n" + "=" * 70)
    print("🔌 ПОЛУЧЕНИЕ ДАННЫХ ИЗ SUPABASE")
    print("=" * 70 + "\n")

    data = get_supabase_data()

    if not data:
        print("\n❌ Не удалось загрузить данные")
        sys.exit(1)

    print(f"\n✅ Успешно загружено {len(data)} записей")

if __name__ == "__main__":
    main()
