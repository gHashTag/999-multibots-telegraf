#!/usr/bin/env node

/**
 * Скрипт для проверки и установки модуля tslib в контейнере
 */

const fs = require('fs')
const { execSync } = require('child_process')

console.log('Проверка наличия модуля tslib...')

try {
  // Попытка импортировать tslib
  require.resolve('tslib')
  console.log('✅ Модуль tslib найден!')
} catch (err) {
  // Если модуль не найден, устанавливаем его
  if (err.code === 'MODULE_NOT_FOUND') {
    console.log('❌ Модуль tslib не найден. Пытаемся установить...')

    try {
      // Создаем каталог для tslib, если его нет
      if (!fs.existsSync('./node_modules/tslib')) {
        console.log('Создаем директорию node_modules/tslib...')
        fs.mkdirSync('./node_modules/tslib', { recursive: true })
      }

      // Устанавливаем tslib
      execSync('npm install --no-save tslib')
      console.log('✅ Модуль tslib успешно установлен!')

      // Проверяем файлы
      const files = fs.readdirSync('./node_modules/tslib')
      console.log(`Содержимое node_modules/tslib: ${files.join(', ')}`)
    } catch (installErr) {
      console.error('❌ Ошибка при установке tslib:', installErr)

      // Последняя попытка - создаем заглушку для tslib
      try {
        console.log('Создаем заглушку для tslib...')
        const tslibPath = './node_modules/tslib/tslib.js'
        const tslibDir = './node_modules/tslib'

        if (!fs.existsSync(tslibDir)) {
          fs.mkdirSync(tslibDir, { recursive: true })
        }

        const tslibContent = `
// TSLib полифил
exports.__extends = function(d, b) {
  for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
  function __() { this.constructor = d; }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};

exports.__assign = Object.assign || function(t) {
  for (var s, i = 1, n = arguments.length; i < n; i++) {
    s = arguments[i];
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
  }
  return t;
};

exports.__rest = function(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
  return t;
};

exports.__awaiter = function(thisArg, _arguments, P, generator) {
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
    function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
    function step(result) { result.done ? resolve(result.value) : new P(function(resolve) { resolve(result.value); }).then(fulfilled, rejected); }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};

module.exports = exports;
`

        fs.writeFileSync(tslibPath, tslibContent)
        console.log('✅ Заглушка для tslib успешно создана!')

        // Создаем package.json для tslib
        const packageJsonContent = `{
  "name": "tslib",
  "version": "2.8.1",
  "main": "tslib.js"
}`
        fs.writeFileSync(`${tslibDir}/package.json`, packageJsonContent)
        console.log('✅ Package.json для tslib успешно создан!')
      } catch (fallbackErr) {
        console.error('❌ Ошибка при создании заглушки для tslib:', fallbackErr)
      }
    }
  } else {
    console.error('❌ Неожиданная ошибка при проверке tslib:', err)
  }
}

// Пытаемся импортировать tslib еще раз для проверки
try {
  const tslib = require('tslib')
  console.log('✅ Модуль tslib успешно импортирован!')
  console.log('Доступные методы:', Object.keys(tslib).join(', '))
} catch (err) {
  console.error('❌ Не удалось импортировать tslib после установки:', err)
}
