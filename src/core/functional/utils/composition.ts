/**
 * Function Composition Utilities
 * 100% функциональный стиль, без классов
 */

// ===== PIPE (LEFT-TO-RIGHT) =====

export const pipe = ((...args: any[]) => {
  if (args.length === 1) {
    return args[0]
  }
  const [value, ...fns] = args
  return fns.reduce((acc, fn) => fn(acc), value)
}) as {
  <A>(value: A): A
  <A, B>(value: A, fn: (a: A) => B): B
  <A, B, C>(value: A, fn1: (a: A) => B, fn2: (b: B) => C): C
  <A, B, C, D>(value: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D): D
  <A, B, C, D, E>(value: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D, fn4: (d: D) => E): E
  <A, B, C, D, E, F>(value: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D, fn4: (d: D) => E, fn5: (e: E) => F): F
  <A, B, C, D, E, F, G>(value: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D, fn4: (d: D) => E, fn5: (e: E) => F, fn6: (f: F) => G): G
  <A, R>(value: A, ...fns: ((a: any) => R)[]): R
}

export const pipe2 = <A, B, R>(a: A, f: (a: A) => B, g: (b: B) => R): R => g(f(a))

export const pipe3 = <A, B, C, R>(
  a: A,
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => R
): R => h(g(f(a)))

export const pipe4 = <A, B, C, D, R>(
  a: A,
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => R
): R => i(h(g(f(a))))

export const pipe5 = <A, B, C, D, E, R>(
  a: A,
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => E,
  j: (e: E) => R
): R => j(i(h(g(f(a)))))

export const pipe6 = <A, B, C, D, E, F, R>(
  a: A,
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => E,
  j: (e: E) => F,
  k: (f: F) => R
): R => k(j(i(h(g(f(a))))))

export const pipe7 = <A, B, C, D, E, F, G, R>(
  a: A,
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => E,
  j: (e: E) => F,
  k: (f: F) => G,
  l: (g: G) => R
): R => l(k(j(i(h(g(f(a)))))))

// Generic pipe for any number of functions
export const pipeFlow = <T extends any[], R>(
  ...fns: { [K in keyof T]: (arg: K extends 0 ? T[0] : T[K] extends keyof T ? T[K] : never) => any }
): ((...args: T) => R) =>
  (...args: T) => fns.reduce((acc, fn, index) => fn(index === 0 ? args[0] : acc), {} as any)

// ===== FLOW (RIGHT-TO-LEFT) =====

export const flow = ((...fns: any[]) => {
  if (fns.length === 0) {
    return (x: any) => x
  }
  return (value: any) => fns.reduce((acc, fn) => fn(acc), value)
}) as {
  (): (x: any) => any
  <A, B>(fn: (a: A) => B): (a: A) => B
  <A, B, C>(f: (a: A) => B, g: (b: B) => C): (a: A) => C
  <A, B, C, D>(f: (a: A) => B, g: (b: B) => C, h: (c: C) => D): (a: A) => D
  <A, B, C, D, E>(f: (a: A) => B, g: (b: B) => C, h: (c: C) => D, i: (d: D) => E): (a: A) => E
  <A, B, C, D, E, F>(f: (a: A) => B, g: (b: B) => C, h: (c: C) => D, i: (d: D) => E, j: (e: E) => F): (a: A) => F
  <A, B, C, D, E, F, G>(f: (a: A) => B, g: (b: B) => C, h: (c: C) => D, i: (d: D) => E, j: (e: E) => F, k: (f: F) => G): (a: A) => G
  <A, R>(...fns: ((a: any) => R)[]): (a: A) => R
}

export const flow2 = <A, R>(f: (a: A) => R, g: (r: R) => R): (a: A) => R => a => g(f(a))

export const flow3 = <A, B, R>(
  f: (a: A) => B,
  g: (b: B) => R,
  h: (r: R) => R
): (a: A) => R => a => h(g(f(a)))

export const flow4 = <A, B, C, R>(
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => R,
  i: (r: R) => R
): (a: A) => R => a => i(h(g(f(a))))

export const flow5 = <A, B, C, D, R>(
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => R,
  j: (r: R) => R
): (a: A) => R => a => j(i(h(g(f(a)))))

export const flow6 = <A, B, C, D, E, R>(
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => E,
  j: (e: E) => R,
  k: (r: R) => R
): (a: A) => R => a => k(j(i(h(g(f(a))))))

export const flow7 = <A, B, C, D, E, F, R>(
  f: (a: A) => B,
  g: (b: B) => C,
  h: (c: C) => D,
  i: (d: D) => E,
  j: (e: E) => F,
  k: (f: F) => R,
  l: (r: R) => R
): (a: A) => R => a => l(k(j(i(h(g(f(a)))))))

// Generic flow for any number of functions
export const flowComposition = <T extends any[], R>(
  ...fns: { [K in keyof T]: (arg: K extends 0 ? R : T[K] extends keyof T ? T[K] : never) => any }
): ((a: T[0]) => R) =>
  (a: T[0]) => fns.reduceRight((acc, fn) => fn(acc), {} as any)

// ===== CONSTANT =====

export const constant = <A>(value: A) => (): A => value
export const always = constant

// ===== IDENTITY =====

export const identity = <A>(value: A): A => value

// ===== CONST =====

export const constTrue = () => true
export const constFalse = () => false
export const constNull = () => null
export const constUndefined = () => undefined
export const constZero = () => 0
export const constEmptyString = () => ''

// ===== UNARY =====

export const unary = <A, B>(fn: (a: A) => B) => fn

// ===== FLIP =====

export const flip = <A, B, R>(fn: (a: A, b: B) => R) => (b: B, a: A) => fn(a, b)

// ===== CURRY =====

export const curry = <A, B, R>(fn: (a: A, b: B) => R) => {
  const curried = (a: A) => (b: B) => fn(a, b)
  curried.length = 2
  return curried as {
    (a: A): (b: B) => R
    (a: A, b: B): R
  }
}

export const uncurry = <A, B, R>(fn: (a: A) => (b: B) => R) => (a: A, b: B) => fn(a)(b)

// ===== COMPOSE =====

export const compose = <A, R>(f: (r: R) => R, g: (a: A) => R): (a: A) => R => a => f(g(a))
export const compose2 = <A, B, R>(f: (b: B) => R, g: (a: A) => B): (a: A) => R => a => f(g(a))
export const compose3 = <A, B, C, R>(
  f: (c: C) => R,
  g: (b: B) => C,
  h: (a: A) => B
): (a: A) => R => a => f(g(h(a)))

// ===== THUNK =====

export const thunk = <A>(fn: () => A): (() => A) => fn

// ===== APPLY =====

export const apply = <A, R>(fn: (a: A) => R) => (a: A) => fn(a)

// ===== MUTATE =====

export const mutate = <A>(fn: (a: A) => void) => (a: A) => {
  fn(a)
  return a
}

// ===== TAP =====

export const tap = <A>(fn: (a: A) => void) => (a: A) => {
  fn(a)
  return a
}

// ===== TAP ASYNC =====

export const tapAsync = <A>(fn: (a: A) => Promise<void>) => async (a: A) => {
  await fn(a)
  return a
}

// ===== DEBOUNCE =====

export const debounce = <A>(fn: (a: A) => void, delay: number) => {
  let timeoutId: NodeJS.Timeout | null = null

  return (a: A) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => fn(a), delay)
  }
}

// ===== THROTTLE =====

export const throttle = <A>(fn: (a: A) => void, delay: number) => {
  let lastCall = 0

  return (a: A) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      fn(a)
    }
  }
}

// ===== CONDITIONAL =====

export const conditional = <A, B>(
  condition: (a: A) => boolean,
  onTrue: (a: A) => B,
  onFalse: (a: A) => B
) => (a: A) => condition(a) ? onTrue(a) : onFalse(a)

// ===== MATCH =====

export const match = <A, B>(
  value: A,
  cases: { [K in keyof A]?: (value: A[K]) => B }
): B | undefined => {
  const key = value as keyof A
  const handler = cases[key]
  return handler ? handler(value[key]) : undefined
}

// ===== PROP =====

export const prop = <K extends string>(key: K) =>
  <A extends { [P in K]: A[K] }>(obj: A): A[K] => obj[key]

export const propOr = <K extends string, A extends { [P in K]: A[K] }, B>(
  defaultValue: B,
  key: K
) => (obj: A): A[K] | B => obj[key] ?? defaultValue as any

// ===== PATH =====

export const path = <K extends string>(
  keys: readonly K[]
) => <A extends Record<K, any>>(obj: A): A[K] => {
  return keys.reduce((acc, key) => acc?.[key], obj as any)
}

export const pathOr = <K extends string[], A extends Record<K[number], any>, B>(
  defaultValue: B,
  keys: K
) => (obj: A): A[K[number]] | B => {
  return keys.reduce((acc, key) => acc?.[key], obj as any) ?? defaultValue
}

// ===== PICK =====

export const pick = <K extends string>(
  keys: readonly K[]
) => <A extends Record<K, any>>(obj: A): Pick<A, K> => {
  const result = {} as Pick<A, K>
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key]
    }
  })
  return result
}

// ===== OMIT =====

export const omit = <K extends string>(
  keys: readonly K[]
) => <A extends Record<K, any>>(obj: A): Omit<A, K> => {
  const result = { ...obj }
  keys.forEach(key => {
    delete result[key]
  })
  return result
}

// ===== ASSIGN =====

export const assign = <A extends object, B extends object>(a: A) => (b: B): A & B =>
  Object.assign({}, a, b)

// ===== MERGE =====

export const merge = <A extends object, B extends object>(a: A) => (b: B): A & B => ({
  ...a,
  ...b
})

// ===== CLONE =====

export const clone = <A>(value: A): A => {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => clone(item)) as any
  }
  const cloned = {} as any
  for (const key in value) {
    if (value.hasOwnProperty(key)) {
      cloned[key] = clone(value[key])
    }
  }
  return cloned
}

// ===== DEEP FREEZE =====

export const deepFreeze = <A>(value: A): A => {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    value.forEach(item => deepFreeze(item))
    return value
  }
  Object.freeze(value)
  for (const key in value) {
    if (value.hasOwnProperty(key)) {
      deepFreeze(value[key])
    }
  }
  return value
}

// ===== EXPORT ALL =====

export default {
  pipe,
  pipe2,
  pipe3,
  pipe4,
  pipe5,
  pipe6,
  pipe7,
  pipeFlow,
  flow,
  flow2,
  flow3,
  flow4,
  flow5,
  flow6,
  flow7,
  flowComposition,
  constant,
  always,
  identity,
  constTrue,
  constFalse,
  constNull,
  constUndefined,
  constZero,
  constEmptyString,
  unary,
  flip,
  curry,
  uncurry,
  compose,
  compose2,
  compose3,
  thunk,
  apply,
  mutate,
  tap,
  tapAsync,
  debounce,
  throttle,
  conditional,
  match,
  prop,
  propOr,
  path,
  pathOr,
  pick,
  omit,
  assign,
  merge,
  clone,
  deepFreeze
}