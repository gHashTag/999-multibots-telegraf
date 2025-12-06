#!/usr/bin/env python3
"""
🚀 БЫСТРЫЙ ЗАПУСК АНАЛИЗА ФЕЙКОВЫХ ДАННЫХ
Получает ключи и запускает анализ
"""

import os
import sys
import json

def get_supabase_credentials():
    """Получает credentials из Infisical или переменных окружения"""

    # Проверяем переменные окружения
    service_key = os.getenv('SUPABASE_SERVICE_KEY')
    url = os.getenv('SUPABASE_URL')

    if service_key and url:
        print("✅ Ключи найдены в переменных окружения")
        return service_key, url

    # Пытаемся получить из Infisical
    try:
        from infisical import InfisicalClient

        client = InfisicalClient(
            client_id=os.getenv('INFISICAL_CLIENT_ID'),
            client_secret=os.getenv('INFISICAL_CLIENT_SECRET'),
            site_url='https://app.infisical.com'
        )

        # Получаем секреты
        secrets = client.list_secrets()
        service_key = next((s.secret_value for s in secrets if s.secret_key == 'SUPABASE_SERVICE_KEY'), None)
        url = next((s.secret_value for s in secrets if s.secret_key == 'SUPABASE_URL'), None)

        if service_key and url:
            print("✅ Ключи получены из Infisical")
            os.environ['SUPABASE_SERVICE_KEY'] = service_key
            os.environ['SUPABASE_URL'] = url
            return service_key, url

    except Exception as e:
        print(f"⚠️  Не удалось получить ключи из Infisical: {e}")

    print("❌ Не удалось найти SUPABASE_SERVICE_KEY")
    print("\n💡 Решения:")
    print("  1. Установите переменную окружения SUPABASE_SERVICE_KEY")
    print("  2. Используйте Infisical для получения ключей")
    print("  3. Создайте файл payments_data.json вручную")

    return None, None

def check_data_file():
    """Проверяет наличие файла с данными"""
    if os.path.exists('payments_data.json'):
        with open('payments_data.json', 'r') as f:
            data = json.load(f)
            print(f"📁 Найден файл payments_data.json с {len(data)} записями")
            return True

    print("⚠️  Файл payments_data.json не найден")
    return False

def main():
    print("\n" + "=" * 70)
    print("🔍 АНАЛИЗ ФЕЙКОВЫХ ДАННЫХ - ЗАПУСК")
    print("=" * 70 + "\n")

    # Проверяем данные
    if check_data_file():
        print("\n🚀 Запускаем анализ с существующими данными...")
    else:
        # Получаем ключи
        service_key, url = get_supabase_credentials()

        if not service_key:
            print("\n❌ Невозможно продолжить без данных")
            sys.exit(1)

    # Запускаем анализ
    try:
        from run_fake_data_analysis import analyze_fake_data
        analyze_fake_data()
    except Exception as e:
        print(f"\n❌ Ошибка анализа: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
