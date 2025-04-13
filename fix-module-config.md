# Рекомендации по исправлению конфигурации модулей

## Обнаруженная проблема

При запуске тестов с помощью `ts-node` возникает ошибка:

```
SyntaxError: Cannot use import statement outside a module
```

Это происходит из-за конфликта между настройками ESM (ECMAScript modules) и CommonJS в проекте:

1. В `tsconfig.json` указано `"module": "es2022"`, что настраивает TypeScript на компиляцию в ES модули
2. В `package.json` не установлено поле `"type": "module"`, поэтому Node.js по умолчанию обрабатывает файлы .js как CommonJS модули

## Варианты решения

### Вариант 1: Настроить проект для работы с ES модулями

1. Добавить в `package.json` следующую настройку:
   ```json
   {
     "type": "module"
   }
   ```

2. Убедиться, что все импорты используют расширения файлов:
   ```typescript
   // Вместо
   import { something } from './module';
   // Использовать
   import { something } from './module.js';
   ```

3. Обновить команды запуска тестов, добавив флаг `--esm`:
   ```json
   "test:scenes": "cross-env NODE_ENV=test ts-node --esm -r tsconfig-paths/register src/test-utils/runScenesTests.ts"
   ```

### Вариант 2: Настроить проект для работы с CommonJS модулями

1. Изменить в `tsconfig.json` следующую настройку:
   ```json
   {
     "compilerOptions": {
       "module": "commonjs"
     }
   }
   ```

2. Убедиться, что используется правильный синтаксис для CommonJS:
   ```typescript
   // При необходимости заменить ESM импорты
   import { something } from './module';
   // на CommonJS импорты
   const { something } = require('./module');
   ```

### Вариант 3: Создать отдельную конфигурацию TypeScript для тестов

1. Создать файл `tsconfig.test.json`:
   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "module": "commonjs"
     }
   }
   ```

2. Обновить команды запуска тестов:
   ```json
   "test:scenes": "cross-env NODE_ENV=test ts-node -r tsconfig-paths/register -P tsconfig.test.json src/test-utils/runScenesTests.ts"
   ```

## Рекомендация

Учитывая текущую структуру проекта и то, что большинство кода написано с использованием ESM синтаксиса, рекомендуется использовать **Вариант 1**. Это позволит сохранить единообразие кодовой базы и избежать проблем с совместимостью модулей.

Если при этом возникнут проблемы с запуском существующих тестов, можно временно использовать **Вариант 3** для запуска тестов, пока код не будет полностью адаптирован для работы с ESM.

## Дополнительные рекомендации

1. Обновить версии зависимостей, особенно ts-node, которая имеет улучшенную поддержку ESM в новых версиях
2. Добавить файл `.mjs` для запуска тестов, который будет явно обрабатываться как ES модуль
3. Рассмотреть возможность использования Jest или Vitest, которые имеют лучшую поддержку ESM и TypeScript 