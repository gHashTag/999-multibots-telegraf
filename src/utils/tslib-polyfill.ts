/**
 * Полифил для tslib, который предоставляет основные функции, требуемые компилированным TypeScript кодом
 */

// __extends для наследования классов
// @ts-ignore
if (typeof globalThis.__extends !== 'function') {
  // @ts-ignore
  globalThis.__extends = function (d: any, b: any) {
    for (const p in b) if (b.hasOwnProperty(p)) d[p] = b[p]
    function __() {
      this.constructor = d
    }
    d.prototype =
      b === null ? Object.create(b) : ((__.prototype = b.prototype), new __())
  }
}

// __assign для Object.assign
// @ts-ignore
if (typeof globalThis.__assign !== 'function') {
  // @ts-ignore
  globalThis.__assign = function (t: any) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i]
      for (const p in s)
        if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p]
    }
    return t
  }
}

// __rest для деструктуризации
// @ts-ignore
if (typeof globalThis.__rest !== 'function') {
  // @ts-ignore
  globalThis.__rest = function (s: any, e: any) {
    const t = {}
    for (const p in s)
      if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p]
    return t
  }
}

// __awaiter для async/await
// @ts-ignore
if (typeof globalThis.__awaiter !== 'function') {
  // @ts-ignore
  globalThis.__awaiter = function (
    thisArg: any,
    _arguments: any,
    P: any,
    generator: any
  ) {
    return new (P || (P = Promise))(function (resolve: any, reject: any) {
      function fulfilled(value: any) {
        try {
          step(generator.next(value))
        } catch (e) {
          reject(e)
        }
      }
      function rejected(value: any) {
        try {
          step(generator['throw'](value))
        } catch (e) {
          reject(e)
        }
      }
      function step(result: any) {
        result.done
          ? resolve(result.value)
          : new P(function (resolve: any) {
              resolve(result.value)
            }).then(fulfilled, rejected)
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next())
    })
  }
}

// Экспортируем все функции
export {
  // @ts-ignore
  __extends as extends,
  // @ts-ignore
  __assign as assign,
  // @ts-ignore
  __rest as rest,
  // @ts-ignore
  __awaiter as awaiter,
}
