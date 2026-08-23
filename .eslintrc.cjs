/**
 * Конфигурации ESLint в этом репозитории НЕ БЫЛО ВООБЩЕ.
 *
 * Плагины стояли в devDependencies (@typescript-eslint/parser и остальные), в
 * package.json был скрипт lint, в pre-commit висел lint-staged с `eslint --fix`
 * — а конфига не было ни файлом, ни полем eslintConfig. Без него ESLint 8
 * разбирает файлы стандартным парсером espree, который не знает ни TypeScript,
 * ни модулей, и падает на ПЕРВОЙ же строке каждого файла:
 *
 *   1:1  error  Parsing error: The keyword 'import' is reserved
 *
 * То есть линт не проходил никогда и ни по одному файлу. Хук при этом печатал
 * «✅ Все проверки пройдены», потому что код возврата lint-staged не
 * проверялся, — гейт сообщал об успехе, ничего не проверив.
 *
 * Правила ниже намеренно СКРОМНЫЕ. В репозитории уже есть накопленный долг
 * (208 падающих тестов, 67 ошибок типов в редакторе), и включать сейчас строгий
 * набор значит перекрыть работу целиком. Здесь только то, что ловит настоящие
 * дефекты, а не стиль: стиль форматирует prettier.
 */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // Без project: правила с типами требуют полной программы и на большом
    // репозитории добавляют десятки секунд к каждому коммиту. Проверку типов
    // делает tsc — здесь она была бы дублем.
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // Отключает правила, спорящие с prettier. Идёт последним намеренно.
    'prettier',
  ],
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    'coverage/',
    'apps/',
    'docs/',
    '*.js',
    '*.cjs',
    '*.mjs',
  ],
  rules: {
    // Настоящие дефекты — оставляем ошибками.
    'no-debugger': 'error',
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    '@typescript-eslint/no-misused-new': 'error',
    // Объявление внутри case без блока утекает в соседние ветки — это
    // источник настоящих ошибок, а не вкусовщина.
    'no-case-declarations': 'error',

    // Стилевой долг, накопленный до появления конфига. Ошибкой его делать
    // нельзя: 47 мест с ban-types и 10 с ban-ts-comment перекрыли бы правку
    // любого из этих файлов, хотя к дефекту в правке они отношения не имеют.
    '@typescript-eslint/ban-types': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    'prefer-const': 'warn',

    // Долг, который нельзя закрыть одним коммитом, — предупреждения.
    // Предупреждение видно человеку и не блокирует чужую работу.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-empty': ['warn', { allowEmptyCatch: true }],

    // console в боте — рабочий инструмент журналирования, не дефект.
    'no-console': 'off',
    '@typescript-eslint/no-var-requires': 'off',
  },
}
