# 📚 Правила Организации Кода и Документации

## 🎯 Основные принципы
```typescript
interface FolderStructureRule {
  type: 'ORGANIZATION_STANDARD';
  name: 'UNIFIED_FOLDER_STRUCTURE';
  description: 'Единый стандарт организации папок и файлов';

  requiredFiles: {
    documentation: [
      'MAIN.md',      // Основной документ с описанием
      'ROADMAP.md',   // План развития и статус
      'index.ts'      // Точка входа TypeScript
    ];
    
    optional: [
      'README.md',    // Краткое описание для GitHub
      'HISTORY.md',   // История изменений
      'TESTS.md'      // Документация по тестам
    ];
  };

  folderStructure: {
    src: {
      description: 'Исходный код',
      required: ['index.ts']
    };
    tests: {
      description: 'Тесты',
      required: ['index.test.ts']
    };
    docs: {
      description: 'Документация',
      required: ['MAIN.md']
    };
    scripts: {
      description: 'Скрипты автоматизации',
      required: ['check-structure.sh']
    };
  };

  namingConventions: {
    files: {
      documentation: '*.md',
      typescript: '*.ts',
      tests: '*.test.ts',
      scripts: '*.sh'
    };
    
    folders: {
      pattern: 'kebab-case',
      example: 'my-feature-folder'
    };
  };
}

interface TestOrganizationRule {
  type: 'TEST_STANDARD';
  name: 'UNIFIED_TEST_STRUCTURE';
  
  location: 'tests/';
  
  structure: {
    unit: 'tests/unit/',
    integration: 'tests/integration/',
    e2e: 'tests/e2e/',
    utils: 'tests/utils/'
  };
  
  naming: {
    pattern: '{feature}.test.ts',
    example: 'auth.test.ts'
  };
}
```

## 🔍 Правила проверки
1. Каждая папка должна содержать основные документы
2. Все тесты должны быть в папке tests
3. Все скрипты должны быть в папке scripts
4. Документация должна быть актуальной
5. Код должен быть типизирован

## 🚀 Автоматизация
1. Скрипты проверки структуры
2. Автоматическое создание файлов
3. Валидация документации
4. Проверка типизации

## 💡 Контекст и навигация
1. MAIN.md содержит основной контекст
2. ROADMAP.md отражает статус и планы
3. index.ts экспортирует типы и функции
4. Тесты документируют поведение

## 🎯 Цели структуры
1. Быстрая навигация
2. Понятный контекст
3. Автоматизация проверок
4. Поддержание порядка