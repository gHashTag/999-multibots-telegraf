#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Детальный анализ аномалий в файле payments_data.json
"""

import json
import sys
from datetime import datetime
from collections import Counter, defaultdict
from typing import Dict, List, Any, Set, Tuple
import re

def load_data(filepath: str) -> List[Dict]:
    """Загрузка JSON данных"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def analyze_structure(data: List[Dict]) -> Dict:
    """Анализ структуры данных"""
    if not data:
        return {}

    fields = set(data[0].keys())
    field_types = {}

    for field in fields:
        sample_value = data[0].get(field)
        field_types[field] = type(sample_value).__name__

    return {
        'total_records': len(data),
        'fields': list(fields),
        'field_types': field_types,
        'sample_record': data[0] if data else None
    }

def find_duplicate_records(data: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Поиск полных дубликатов"""
    seen = {}
    duplicates = []

    for i, record in enumerate(data):
        # Создаем ключ из всех полей
        key = json.dumps(record, sort_keys=True)

        if key in seen:
            duplicates.append({
                'duplicate_index': i,
                'original_index': seen[key],
                'record': record
            })
        else:
            seen[key] = i

    return duplicates, seen

def find_partial_duplicates(data: List[Dict], key_fields: List[str]) -> List[Dict]:
    """Поиск частичных дубликатов по ключевым полям"""
    seen = {}
    duplicates = []

    for i, record in enumerate(data):
        # Создаем ключ из указанных полей
        key = json.dumps({k: record.get(k) for k in key_fields}, sort_keys=True)

        if key in seen:
            duplicates.append({
                'duplicate_index': i,
                'original_index': seen[key],
                'record': record,
                'key_fields': {k: record.get(k) for k in key_fields}
            })
        else:
            seen[key] = i

    return duplicates

def analyze_dates(data: List[Dict]) -> Dict:
    """Анализ корректности дат"""
    date_issues = {
        'invalid_format': [],
        'future_dates': [],
        'pre_2020_dates': [],
        'null_dates': [],
        'correct_dates': []
    }

    current_date = datetime.now()
    min_date = datetime(2020, 1, 1)

    for i, record in enumerate(data):
        created_at = record.get('created_at')

        if not created_at or created_at == 'null' or created_at == '':
            date_issues['null_dates'].append({'index': i, 'record': record})
            continue

        try:
            # Пробуем разные форматы дат
            date_formats = [
                '%Y-%m-%dT%H:%M:%S.%f%z',
                '%Y-%m-%dT%H:%M:%S%z',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d'
            ]

            parsed_date = None
            for fmt in date_formats:
                try:
                    parsed_date = datetime.strptime(created_at, fmt)
                    break
                except (ValueError, TypeError):
                    continue

            if not parsed_date:
                date_issues['invalid_format'].append({
                    'index': i,
                    'value': created_at,
                    'record': record
                })
            else:
                # Проверяем диапазон
                if parsed_date > current_date:
                    date_issues['future_dates'].append({
                        'index': i,
                        'value': created_at,
                        'date': parsed_date.isoformat(),
                        'record': record
                    })
                elif parsed_date < min_date:
                    date_issues['pre_2020_dates'].append({
                        'index': i,
                        'value': created_at,
                        'date': parsed_date.isoformat(),
                        'record': record
                    })
                else:
                    date_issues['correct_dates'].append(i)

        except Exception as e:
            date_issues['invalid_format'].append({
                'index': i,
                'value': created_at,
                'error': str(e),
                'record': record
            })

    return date_issues

def analyze_missing_fields(data: List[Dict]) -> Dict:
    """Анализ отсутствующих полей"""
    if not data:
        return {}

    expected_fields = set(data[0].keys())
    missing_fields = defaultdict(list)

    for i, record in enumerate(data):
        record_fields = set(record.keys())
        missing = expected_fields - record_fields

        if missing:
            for field in missing:
                missing_fields[field].append({
                    'index': i,
                    'record': record
                })

    return dict(missing_fields)

def analyze_amounts(data: List[Dict]) -> Dict:
    """Анализ аномальных сумм"""
    issues = {
        'negative_amounts': [],
        'zero_amounts': [],
        'extremely_large': [],  # > 10000
        'negative_with_negative_type': [],
        'positive_with_outcome_type': [],
        'missing_amounts': []
    }

    for i, record in enumerate(data):
        amount = record.get('amount')
        amount_type = record.get('type', '')

        if amount is None:
            issues['missing_amounts'].append({'index': i, 'record': record})
            continue

        try:
            amount_val = float(amount)

            if amount_val < 0:
                issues['negative_amounts'].append({
                    'index': i,
                    'value': amount,
                    'record': record
                })

                # Отрицательная сумма с отрицательным типом может быть нормальной
                if 'OUTCOME' in amount_type or 'DEBIT' in amount_type:
                    issues['negative_with_negative_type'].append({
                        'index': i,
                        'value': amount,
                        'type': amount_type,
                        'record': record
                    })
            elif amount_val == 0:
                issues['zero_amounts'].append({
                    'index': i,
                    'value': amount,
                    'record': record
                })
            elif amount_val > 10000:
                issues['extremely_large'].append({
                    'index': i,
                    'value': amount,
                    'record': record
                })
            elif 'OUTCOME' in amount_type or 'DEBIT' in amount_type:
                if amount_val > 0:
                    issues['positive_with_outcome_type'].append({
                        'index': i,
                        'value': amount,
                        'type': amount_type,
                        'record': record
                    })

        except (ValueError, TypeError):
            issues['missing_amounts'].append({
                'index': i,
                'value': amount,
                'record': record
            })

    return issues

def analyze_currencies(data: List[Dict]) -> Dict:
    """Анализ валют"""
    currency_issues = {
        'unknown_currencies': [],
        'empty_currencies': [],
        'currency_distribution': Counter()
    }

    valid_currencies = {'STARS', 'XTR', 'RUB', 'USD', 'EUR', 'BTC', 'ETH', 'TON'}

    for i, record in enumerate(data):
        currency = record.get('currency')
        currency_issues['currency_distribution'][currency] += 1

        if not currency or currency == '' or currency == 'null':
            currency_issues['empty_currencies'].append({
                'index': i,
                'record': record
            })
        elif currency not in valid_currencies:
            currency_issues['unknown_currencies'].append({
                'index': i,
                'value': currency,
                'record': record
            })

    return currency_issues

def analyze_payment_types(data: List[Dict]) -> Dict:
    """Анализ типов операций"""
    type_issues = {
        'unknown_types': [],
        'empty_types': [],
        'type_distribution': Counter()
    }

    valid_types = {'MONEY_INCOME', 'MONEY_OUTCOME', 'DEBIT', 'CREDIT', 'INCOME', 'OUTCOME'}

    for i, record in enumerate(data):
        op_type = record.get('type')
        type_issues['type_distribution'][op_type] += 1

        if not op_type or op_type == '' or op_type == 'null':
            type_issues['empty_types'].append({
                'index': i,
                'record': record
            })
        elif op_type not in valid_types:
            type_issues['unknown_types'].append({
                'index': i,
                'value': op_type,
                'record': record
            })

    return type_issues

def analyze_bots_and_users(data: List[Dict]) -> Dict:
    """Анализ ботов и пользователей"""
    bot_stats = Counter()
    user_stats = Counter()
    duplicate_users_in_same_bot = []
    users_by_bot = defaultdict(set)

    for i, record in enumerate(data):
        bot_name = record.get('bot_name', '')
        telegram_id = record.get('telegram_id')

        bot_stats[bot_name] += 1
        user_stats[telegram_id] += 1

        if bot_name:
            users_by_bot[bot_name].add(telegram_id)

    # Проверяем дубликаты пользователей в одном боте
    for bot_name, users in users_by_bot.items():
        if len(users) > 1:
            # Это нормально, множество пользователей могут использовать одного бота
            pass
        elif len(users) == 1:
            # Один пользователь на бота - возможно аномалия
            pass

    return {
        'unique_bots': len(bot_stats),
        'unique_users': len(user_stats),
        'bot_distribution': dict(bot_stats.most_common()),
        'top_users': dict(user_stats.most_common(10)),
        'users_per_bot': {bot: len(users) for bot, users in users_by_bot.items()}
    }

def analyze_field_patterns(data: List[Dict]) -> Dict:
    """Анализ паттернов в текстовых полях"""
    patterns = {
        'short_descriptions': [],
        'long_descriptions': [],
        'empty_descriptions': [],
        'suspicious_bots': []
    }

    for i, record in enumerate(data):
        desc = record.get('description', '')

        if not desc or desc == '' or desc == 'null':
            patterns['empty_descriptions'].append({
                'index': i,
                'record': record
            })
        elif len(desc) < 5:
            patterns['short_descriptions'].append({
                'index': i,
                'length': len(desc),
                'value': desc,
                'record': record
            })
        elif len(desc) > 500:
            patterns['long_descriptions'].append({
                'index': i,
                'length': len(desc),
                'value': desc[:100] + '...',
                'record': record
            })

        # Проверяем названия ботов
        bot_name = record.get('bot_name', '')
        if bot_name and len(bot_name) > 100:
            patterns['suspicious_bots'].append({
                'index': i,
                'bot_name': bot_name,
                'length': len(bot_name),
                'record': record
            })

    return patterns

def calculate_impact_on_metrics(data: List[Dict], anomalies: Dict) -> Dict:
    """Расчет влияния аномалий на итоговые метрики"""
    total_amount_by_currency = defaultdict(float)
    total_records = len(data)

    # Считаем корректные записи
    for record in data:
        try:
            amount = float(record.get('amount', 0))
            currency = record.get('currency', 'UNKNOWN')
            total_amount_by_currency[currency] += amount
        except (ValueError, TypeError):
            pass

    # Считаем аномальные записи
    anomalous_amounts = defaultdict(float)
    for anomaly_type, anomaly_data in anomalies.items():
        if isinstance(anomaly_data, dict):
            if 'negative_amounts' in anomaly_data:
                for item in anomaly_data['negative_amounts']:
                    try:
                        amount = float(item['value'])
                        anomalous_amounts['negative'] += abs(amount)
                    except:
                        pass

            if 'zero_amounts' in anomaly_data:
                anomalous_amounts['zero_count'] += len(anomaly_data['zero_amounts'])

            if 'extremely_large' in anomaly_data:
                for item in anomaly_data['extremely_large']:
                    try:
                        amount = float(item['value'])
                        anomalous_amounts['large'] += amount
                    except:
                        pass

    return {
        'total_amounts_by_currency': dict(total_amount_by_currency),
        'total_records': total_records,
        'affected_by_anomalies': {
            'negative_amounts_sum': anomalous_amounts['negative'],
            'zero_amounts_count': anomalous_amounts['zero_count'],
            'extremely_large_sum': anomalous_amounts['large']
        }
    }

def classify_by_severity(anomalies: Dict) -> Dict:
    """Классификация аномалий по критичности"""
    severity = {
        'critical': [],  # Полностью некорректные данные
        'high': [],      # Данные, которые искажают метрики
        'medium': [],    # Неполные или нестандартные данные
        'low': [],       # Мелкие несоответствия
        'info': []       # Информационные замечания
    }

    # Анализируем каждую аномалию
    for category, data in anomalies.items():
        if isinstance(data, dict):
            if 'invalid_format' in data and data['invalid_format']:
                severity['critical'].append({
                    'type': f'{category}.invalid_format',
                    'count': len(data['invalid_format']),
                    'description': 'Некорректный формат данных'
                })

            if 'future_dates' in data and data['future_dates']:
                severity['high'].append({
                    'type': f'{category}.future_dates',
                    'count': len(data['future_dates']),
                    'description': 'Даты из будущего'
                })

            if 'negative_amounts' in data and data['negative_amounts']:
                severity['high'].append({
                    'type': f'{category}.negative_amounts',
                    'count': len(data['negative_amounts']),
                    'description': 'Отрицательные суммы'
                })

            if 'empty_currencies' in data and data['empty_currencies']:
                severity['medium'].append({
                    'type': f'{category}.empty_currencies',
                    'count': len(data['empty_currencies']),
                    'description': 'Пустые валюты'
                })

            if 'zero_amounts' in data and data['zero_amounts']:
                severity['medium'].append({
                    'type': f'{category}.zero_amounts',
                    'count': len(data['zero_amounts']),
                    'description': 'Нулевые суммы'
                })

    return severity

def main():
    print("="*80)
    print("АНАЛИЗ АНОМАЛИЙ В ФАЙЛЕ PAYMENTS_DATA.JSON")
    print("="*80)
    print()

    # Загрузка данных
    print("Загрузка данных...")
    data = load_data('/Users/playra/999-multibots-telegraf/payments_data.json')
    print(f"Загружено {len(data)} записей")
    print()

    # Анализ структуры
    print("1. Анализ структуры данных...")
    structure = analyze_structure(data)
    print(f"   - Всего записей: {structure['total_records']}")
    print(f"   - Поля: {', '.join(structure['fields'])}")
    print()

    # Поиск дубликатов
    print("2. Поиск дубликатов...")
    full_duplicates, seen_keys = find_duplicate_records(data)
    print(f"   - Полных дубликатов: {len(full_duplicates)}")

    partial_duplicates = find_partial_duplicates(
        data,
        ['telegram_id', 'bot_name', 'created_at']
    )
    print(f"   - Частичных дубликатов (ID+бот+дата): {len(partial_duplicates)}")
    print()

    # Анализ дат
    print("3. Анализ дат...")
    date_issues = analyze_dates(data)
    print(f"   - Некорректный формат: {len(date_issues['invalid_format'])}")
    print(f"   - Даты из будущего: {len(date_issues['future_dates'])}")
    print(f"   - Даты до 2020: {len(date_issues['pre_2020_dates'])}")
    print(f"   - Пустые даты: {len(date_issues['null_dates'])}")
    print(f"   - Корректные даты: {len(date_issues['correct_dates'])}")
    print()

    # Анализ отсутствующих полей
    print("4. Анализ отсутствующих полей...")
    missing_fields = analyze_missing_fields(data)
    for field, items in missing_fields.items():
        print(f"   - {field}: {len(items)} записей")
    print()

    # Анализ сумм
    print("5. Анализ сумм...")
    amount_issues = analyze_amounts(data)
    print(f"   - Отрицательные суммы: {len(amount_issues['negative_amounts'])}")
    print(f"   - Нулевые суммы: {len(amount_issues['zero_amounts'])}")
    print(f"   - Очень большие суммы (>10000): {len(amount_issues['extremely_large'])}")
    print(f"   - Положительные с типом OUTCOME: {len(amount_issues['positive_with_outcome_type'])}")
    print(f"   - Отсутствующие суммы: {len(amount_issues['missing_amounts'])}")
    print()

    # Анализ валют
    print("6. Анализ валют...")
    currency_issues = analyze_currencies(data)
    print(f"   - Неизвестные валюты: {len(currency_issues['unknown_currencies'])}")
    print(f"   - Пустые валюты: {len(currency_issues['empty_currencies'])}")
    print("   - Распределение валют:")
    for currency, count in currency_issues['currency_distribution'].most_common():
        print(f"      * {currency}: {count}")
    print()

    # Анализ типов операций
    print("7. Анализ типов операций...")
    type_issues = analyze_payment_types(data)
    print(f"   - Неизвестные типы: {len(type_issues['unknown_types'])}")
    print(f"   - Пустые типы: {len(type_issues['empty_types'])}")
    print("   - Распределение типов:")
    for ptype, count in type_issues['type_distribution'].most_common():
        print(f"      * {ptype}: {count}")
    print()

    # Анализ ботов и пользователей
    print("8. Анализ ботов и пользователей...")
    bot_user_stats = analyze_bots_and_users(data)
    print(f"   - Уникальных ботов: {bot_user_stats['unique_bots']}")
    print(f"   - Уникальных пользователей: {bot_user_stats['unique_users']}")
    print("   - Топ-5 ботов по использованию:")
    for bot, count in list(bot_user_stats['bot_distribution'].items())[:5]:
        print(f"      * {bot}: {count} операций")
    print("   - Топ-5 пользователей по активности:")
    for user_id, count in list(bot_user_stats['top_users'].items())[:5]:
        print(f"      * {user_id}: {count} операций")
    print()

    # Анализ текстовых полей
    print("9. Анализ текстовых полей...")
    field_patterns = analyze_field_patterns(data)
    print(f"   - Короткие описания (<5 символов): {len(field_patterns['short_descriptions'])}")
    print(f"   - Длинные описания (>500 символов): {len(field_patterns['long_descriptions'])}")
    print(f"   - Пустые описания: {len(field_patterns['empty_descriptions'])}")
    print(f"   - Подозрительные названия ботов: {len(field_patterns['suspicious_bots'])}")
    print()

    # Подготовка полного отчета
    print("10. Создание детального отчета...")
    anomalies = {
        'duplicates': {
            'full_duplicates': full_duplicates,
            'partial_duplicates': partial_duplicates
        },
        'dates': date_issues,
        'missing_fields': missing_fields,
        'amounts': amount_issues,
        'currencies': currency_issues,
        'payment_types': type_issues,
        'bots_and_users': bot_user_stats,
        'field_patterns': field_patterns
    }

    # Влияние на метрики
    metrics_impact = calculate_impact_on_metrics(data, anomalies)

    # Классификация по критичности
    severity_classification = classify_by_severity(anomalies)

    # Создание итогового отчета
    report = {
        'summary': {
            'total_records': len(data),
            'analysis_date': datetime.now().isoformat(),
            'data_source': 'payments_data.json'
        },
        'structure': structure,
        'anomalies': anomalies,
        'metrics_impact': metrics_impact,
        'severity_classification': severity_classification,
        'examples': {
            'full_duplicates': full_duplicates[:5],
            'partial_duplicates': partial_duplicates[:5],
            'invalid_dates': date_issues['invalid_format'][:5],
            'future_dates': date_issues['future_dates'][:5],
            'negative_amounts': amount_issues['negative_amounts'][:5],
            'zero_amounts': amount_issues['zero_amounts'][:5],
            'extremely_large': amount_issues['extremely_large'][:5],
            'unknown_currencies': currency_issues['unknown_currencies'][:5],
            'empty_currencies': currency_issues['empty_currencies'][:5],
            'unknown_types': type_issues['unknown_types'][:5],
            'empty_types': type_issues['empty_types'][:5],
            'short_descriptions': field_patterns['short_descriptions'][:5],
            'empty_descriptions': field_patterns['empty_descriptions'][:5],
            'suspicious_bots': field_patterns['suspicious_bots'][:5]
        },
        'statistics': {
            'total_anomalies': sum([
                len(full_duplicates),
                len(partial_duplicates),
                sum(len(v) if isinstance(v, list) else 0 for v in date_issues.values()),
                sum(len(v) if isinstance(v, list) else 0 for v in amount_issues.values()),
                len(currency_issues['unknown_currencies']) + len(currency_issues['empty_currencies']),
                len(type_issues['unknown_types']) + len(type_issues['empty_types']),
                len(field_patterns['empty_descriptions'])
            ]),
            'clean_records': len(data) - sum([
                len(full_duplicates),
                len(partial_duplicates),
                len(date_issues['invalid_format']) + len(date_issues['future_dates']) + len(date_issues['null_dates']),
                len(amount_issues['missing_amounts']) + len(amount_issues['extremely_large']),
                len(currency_issues['empty_currencies']),
                len(type_issues['empty_types']),
                len(field_patterns['empty_descriptions'])
            ])
        },
        'recommendations': [
            "1. Удалить все полные дубликаты записей",
            "2. Исправить некорректные форматы дат",
            "3. Заполнить отсутствующие поля валют и типов операций",
            "4. Проверить логику отрицательных сумм (возврат средств?)",
            "5. Добавить валидацию при добавлении новых записей",
            "6. Создать уникальные индексы для предотвращения дубликатов",
            "7. Стандартизировать описания операций",
            "8. Добавить проверки диапазонов дат и сумм"
        ]
    }

    # Сохранение отчета
    output_file = '/Users/playra/999-multibots-telegraf/data-anomalies-detailed.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"Детальный отчет сохранен в: {output_file}")
    print()
    print("="*80)
    print("КРАТКАЯ СВОДКА")
    print("="*80)
    print(f"Всего записей: {report['statistics']['total_anomalies']}")
    print(f"Записей с аномалиями: {report['statistics']['total_anomalies']}")
    print(f"Корректных записей: {report['statistics']['clean_records']}")
    print(f"Процент аномалий: {(report['statistics']['total_anomalies']/len(data)*100):.2f}%")
    print()
    print("Классификация по критичности:")
    print(f"  Критические: {len(severity_classification['critical'])}")
    print(f"  Высокие: {len(severity_classification['high'])}")
    print(f"  Средние: {len(severity_classification['medium'])}")
    print(f"  Низкие: {len(severity_classification['low'])}")
    print(f"  Информационные: {len(severity_classification['info'])}")
    print("="*80)

if __name__ == '__main__':
    main()
