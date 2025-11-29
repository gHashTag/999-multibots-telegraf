/**
 * Functional programming utilities for Result/Either pattern
 * Simplified implementation for backward compatibility
 */

// Basic Either type
export type Either<E, A> = Left<E> | Right<A>

export interface Left<E> {
  readonly _tag: 'Left'
  readonly left: E
}

export interface Right<A> {
  readonly _tag: 'Right'
  readonly right: A
}

// TaskEither is an async Either
export type TaskEither<E, A> = () => Promise<Either<E, A>>

// Constructors
export const left = <E, A = never>(e: E): Either<E, A> => ({
  _tag: 'Left',
  left: e
})

export const right = <A, E = never>(a: A): Either<E, A> => ({
  _tag: 'Right',
  right: a
})

// Helper to check which variant
export const isLeft = <E, A>(ea: Either<E, A>): ea is Left<E> =>
  ea._tag === 'Left'

export const isRight = <E, A>(ea: Either<E, A>): ea is Right<A> =>
  ea._tag === 'Right'

// Map over Right value
export const map = <E, A, B>(
  f: (a: A) => B
) => (ea: Either<E, A>): Either<E, B> =>
  isLeft(ea) ? ea : right(f(ea.right))

// Map over Left value
export const mapLeft = <E, A, F>(
  f: (e: E) => F
) => (ea: Either<E, A>): Either<F, A> =>
  isLeft(ea) ? left(f(ea.left)) : ea

// Chain (flatMap)
export const chain = <E, A, B>(
  f: (a: A) => Either<E, B>
) => (ea: Either<E, A>): Either<E, B> =>
  isLeft(ea) ? ea : f(ea.right)

// Tap (perform side effect if Right)
export const tap = <E, A>(
  f: (a: A) => void
) => (ea: Either<E, A>): Either<E, A> => {
  if (isRight(ea)) {
    f(ea.right)
  }
  return ea
}

// TapLeft (perform side effect if Left)
export const tapLeft = <E, A>(
  f: (e: E) => void
) => (ea: Either<E, A>): Either<E, A> => {
  if (isLeft(ea)) {
    f(ea.left)
  }
  return ea
}

// TapTask (async side effect)
export const tapTask = <E, A>(
  f: (a: A) => Promise<void>
) => async (ea: Either<E, A>): Promise<Either<E, A>> => {
  if (isRight(ea)) {
    await f(ea.right)
  }
  return ea
}

// Fold/match
export const fold = <E, A, B>(
  onLeft: (e: E) => B,
  onRight: (a: A) => B
) => (ea: Either<E, A>): B =>
  isLeft(ea) ? onLeft(ea.left) : onRight(ea.right)

// Get or else (extract Right value or return default)
export const getOrElse = <E, A>(
  defaultValue: A
) => (ea: Either<E, A>): A =>
  isRight(ea) ? ea.right : defaultValue

// Try-catch wrapper
export const tryCatch = <E, A>(
  f: () => A,
  onError: (error: unknown) => E
): Either<E, A> => {
  try {
    return right(f())
  } catch (error) {
    return left(onError(error))
  }
}

// Async try-catch
export const tryCatchAsync = <E, A>(
  f: () => Promise<A>,
  onError: (error: unknown) => E
): TaskEither<E, A> => async () => {
  try {
    const result = await f()
    return right(result)
  } catch (error) {
    return left(onError(error))
  }
}

// Flatten nested Either
export const flatten = <E, A>(
  eea: Either<E, Either<E, A>>
): Either<E, A> =>
  isLeft(eea) ? eea : eea.right

// From Promise (convert Promise to TaskEither)
export const fromPromise = <E, A>(
  promise: Promise<A>,
  onError: (error: unknown) => E
): TaskEither<E, A> => async () => {
  try {
    const result = await promise
    return right(result)
  } catch (error) {
    return left(onError(error))
  }
}

// Pipe utility (compose functions left-to-right)
export const pipe = <A>(a: A) => ({
  pipe: <B>(f: (a: A) => B) => pipe(f(a))
}) as any // Simplified implementation

// Default export for convenience
export default {
  left,
  right,
  isLeft,
  isRight,
  map,
  mapLeft,
  chain,
  tap,
  tapLeft,
  tapTask,
  fold,
  getOrElse,
  tryCatch,
  tryCatchAsync,
  flatten,
  fromPromise,
  pipe
}
