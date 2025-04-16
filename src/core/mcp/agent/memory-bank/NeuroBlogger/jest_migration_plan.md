# 🔄 План миграции с Jest на нативные тесты

## 📋 Этапы миграции

### 1️⃣ Подготовка (День 1)
- [ ] Создать новую директорию для нативных тестов
- [ ] Настроить базовую инфраструктуру тестирования
- [ ] Создать базовые утилиты для моков

### 2️⃣ Миграция моков (День 1-2)
- [ ] Заменить jest.fn() на нативные моки
- [ ] Создать утилиты для spy функций
- [ ] Реализовать систему матчеров

### 3️⃣ Миграция тестов (День 2-3)
- [ ] Перенести тесты платежной системы
- [ ] Обновить тесты сцен
- [ ] Мигрировать интеграционные тесты

### 4️⃣ Очистка (День 4)
- [ ] Удалить все импорты Jest
- [ ] Удалить Jest из package.json
- [ ] Обновить скрипты запуска тестов

## 🛠️ Нативные замены для Jest

### Моки
```typescript
function createMock<T extends Function>() {
  const calls: any[][] = [];
  const mock = function(...args: any[]) {
    calls.push(args);
    return mock.returnValue;
  };
  
  mock.calls = calls;
  mock.returnValue = undefined;
  
  return mock;
}
```

### Матчеры
```typescript
const expect = {
  toBe(actual: any, expected: any) {
    if (actual !== expected) {
      throw new Error(`Expected ${actual} to be ${expected}`);
    }
  },
  // ... другие матчеры
};
```

### Spy функции
```typescript
function spyOn<T extends object, K extends keyof T>(obj: T, method: K) {
  const original = obj[method];
  const calls: any[][] = [];
  
  obj[method] = function(...args: any[]) {
    calls.push(args);
    return original.apply(this, args);
  } as any;
  
  return { calls };
}
```

## 📊 Прогресс миграции
- Всего файлов с Jest: 25
- Мигрировано: 0
- Осталось: 25

## 🎯 Приоритеты
1. Тесты платежной системы
2. Тесты сцен бота
3. Интеграционные тесты
4. Вспомогательные утилиты

## ⚠️ Особые случаи
- Асинхронные тесты
- Моки для баз данных
- Интеграционные тесты
- Снапшот тесты

_Последнее обновление: 16.04.2025_