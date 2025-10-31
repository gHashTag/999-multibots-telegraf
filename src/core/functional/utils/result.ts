/**
 * Result/Either - Functional Error Handling
 * 100% функциональный стиль, без классов
 */

// ===== EITHER TYPE =====

export type Left<L> = { readonly _tag: 'Left'; readonly value: L }
export type Right<R> = { readonly _tag: 'Right'; readonly value: R }
export type Either<L, R> = Left<L> | Right<R>

// ===== CONSTRUCTORS =====

export const left = <L>(value: L): Left<L> => ({ _tag: 'Left', value })
export const right = <R>(value: R): Right<R> => ({ _tag: 'Right', value })

// ===== GUARDS =====

export const isLeft = <L, R>(e: Either<L, R>): e is Left<L> => e._tag === 'Left'
export const isRight = <L, R>(e: Either<L, R>): e is Right<R> => e._tag === 'Right'

// ===== MAPPERS =====

export const map = <L, R, A>(f: (r: R) => A) =>
  <E extends Either<L, R>>(e: E): E extends Right<R> ? Right<A> : E =>
    isRight(e) ? right(f(e.value)) as any : e as any

export const mapLeft = <L, R, A>(f: (l: L) => A) =>
  <E extends Either<L, R>>(e: E): E extends Left<L> ? Left<A> : E =>
    isLeft(e) ? left(f(e.value)) as any : e as any

// ===== CHAIN =====

export const chain = <L, R, A>(f: (r: R) => Either<L, A>) =>
  <E extends Either<L, R>>(e: E): E extends Right<R> ? Either<L, A> : E =>
    isRight(e) ? f(e.value) : e as any

export const chainLeft = <L, R, A>(f: (l: L) => Either<A, R>) =>
  <E extends Either<L, R>>(e: E): Either<A, R> =>
    isLeft(e) ? f(e.value) : right(e.value) as any

// ===== APPLY =====

export const ap = <L, R, A>(fab: Either<L, (r: R) => A>) =>
  <E extends Either<L, R>>(fa: E): E extends Right<R> ? Either<L, A> : E =>
    isRight(fa) && isRight(fab) ? right(fab.value(fa.value)) as any :
    isLeft(fab) ? fab as any : fa as any

// ===== FOLD =====

export const fold = <L, R, A, B>(
  onLeft: (l: L) => A,
  onRight: (r: R) => B
) =>
  (e: Either<L, R>): A | B =>
    isLeft(e) ? onLeft(e.value) : onRight(e.value)

// ===== GET OR ELSE =====

export const getOrElse = <L, R>(defaultValue: R) =>
  (e: Either<L, R>): R =>
    isRight(e) ? e.value : defaultValue

export const getOrElseW = <L, R, B>(defaultValue: B) =>
  (e: Either<L, R>): B | R =>
    isRight(e) ? e.value : defaultValue

// ===== TAP =====

export const tap = <L, R>(f: (r: R) => void) =>
  <E extends Either<L, R>>(e: E): E =>
    isRight(e) ? (f(e.value), e) : e

export const tapLeft = <L, R>(f: (l: L) => void) =>
  <E extends Either<L, R>>(e: E): E =>
    isLeft(e) ? (f(e.value), e) : e

// ===== FLIP =====

export const swap = <L, R>(e: Either<L, R>): Either<R, L> =>
  isLeft(e) ? right(e.value) : left(e.value)

// ===== TRY CATCH =====

export const tryCatch = <A>(task: () => A): Either<Error, A> => {
  try {
    return right(task())
  } catch (error) {
    return left(error instanceof Error ? error : new Error(String(error)))
  }
}

export const tryCatchAsync = <A>(task: () => Promise<A>): Promise<Either<Error, A>> =>
  task().then(value => right(value)).catch(error => left(error instanceof Error ? error : new Error(String(error))))

// ===== TASK (ASYNC) =====

export type Task<A> = () => Promise<A>
export type TaskEither<E, A> = () => Promise<Either<E, A>>

export const fromPromise = <A>(promise: Promise<A>): TaskEither<Error, A> =>
  () => promise.then(value => right(value)).catch(error => left(error instanceof Error ? error : new Error(String(error))))

export const runTaskEither = <E, A>(taskEither: TaskEither<E, A>): Promise<Either<E, A>> =>
  taskEither()

// ===== TASK HELPERS =====

export const mapTask = <E, R, A>(f: (r: R) => A) =>
  (task: TaskEither<E, R>): TaskEither<E, A> =>
    () => task().then(result => isRight(result) ? right(f(result.value)) : result)

export const chainTask = <E, R, A>(f: (r: R) => TaskEither<E, A>) =>
  (task: TaskEither<E, R>): TaskEither<E, A> =>
    () => task().then(result =>
      isRight(result) ? f(result.value)() : Promise.resolve(result)
    )

export const tapTask = <E, R>(f: (r: R) => void) =>
  (task: TaskEither<E, R>): TaskEither<E, R> =>
    () => task().then(result =>
      isRight(result) ? (f(result.value), result) : result
    )

// ===== VALIDATION HELPERS =====

export const fromValidation = <A>(result: t.Validation<A>): Either<t.Errors, A> =>
  result._tag === 'Right' ? right(result.right) : left(result.left)

export const validate = <A>(codec: t.Decoder<unknown, A>, input: unknown): TaskEither<ValidationError, A> =>
  () => {
    const result = codec.decode(input)
    if (result._tag === 'Right') {
      return Promise.resolve(right(result.right))
    }
    return Promise.resolve(left({
      message: 'Validation failed',
      path: [],
      expected: '',
      received: input
    }))
  }

// ===== COMPOSITION HELPERS =====

export const andThen = <L, R, A>(f: (r: R) => Either<L, A>) =>
  chain(f)

export const flatMap = <L, R, A>(f: (r: R) => Either<L, A>) =>
  chain(f)

export const flatten = <L, R>(e: Either<L, Either<L, R>>): Either<L, R> =>
  isLeft(e) ? e : e.value

export const bimap = <L, R, A, B>(f: (l: L) => A, g: (r: R) => B) =>
  <E extends Either<L, R>>(e: E): E extends Right<R> ? Right<B> : Left<A> =>
    isLeft(e) ? left(f(e.value)) as any : right(g(e.value)) as any

export const reduce = <L, R, B>(initial: B, f: (acc: B, r: R) => B) =>
  <E extends Either<L, R>>(e: E): E extends Right<R> ? B : B =>
    isRight(e) ? f(initial, e.value) : initial

// ===== ERROR HELPERS =====

export const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

export const ensure = <L>(condition: boolean, error: L) =>
  <R>(value: R): Either<L, R> =>
    condition ? right(value) : left(error)

// ===== ARRAY HELPERS =====

export const traverseArray = <L, R, A>(
  f: (r: R) => Either<L, A>
) =>
  (array: readonly R[]): Either<L, readonly A[]> => {
    const result: A[] = []
    for (const item of array) {
      const transformed = f(item)
      if (isLeft(transformed)) {
        return transformed
      }
      result.push(transformed.value)
    }
    return right(result)
  }

export const sequenceArray = <L, R>(array: readonly Either<L, R>[]): Either<L, readonly R[]> => {
  const result: R[] = []
  for (const item of array) {
    if (isLeft(item)) {
      return item
    }
    result.push(item.value)
  }
  return right(result)
}

// ===== CONDITIONAL HELPERS =====

export const when = <L, R>(
  condition: boolean,
  onTrue: () => Either<L, R>,
  onFalse: () => Either<L, R>
): Either<L, R> =>
  condition ? onTrue() : onFalse()

export const cond = <L, R>(
  condition: boolean,
  onTrue: R,
  onFalse: R
): Either<L, R> =>
  condition ? right(onTrue) : right(onFalse)

// ===== EXPORT ALL =====

export default {
  left,
  right,
  isLeft,
  isRight,
  map,
  mapLeft,
  chain,
  chainLeft,
  ap,
  fold,
  getOrElse,
  getOrElseW,
  tap,
  tapLeft,
  swap,
  tryCatch,
  tryCatchAsync,
  fromPromise,
  runTaskEither,
  mapTask,
  chainTask,
  tapTask,
  fromValidation,
  validate,
  andThen,
  flatMap,
  flatten,
  bimap,
  reduce,
  toError,
  ensure,
  traverseArray,
  sequenceArray,
  when,
  cond
}