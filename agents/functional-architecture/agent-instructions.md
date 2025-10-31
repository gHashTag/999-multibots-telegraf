# Functional Architecture Specialist Instructions

## Primary Goal
Create a fully functional, type-safe foundation for media generation using functional programming patterns.

## Key Responsibilities

### 1. Type System with io-ts
Create strict, runtime-validated types:

```typescript
// Example: Video types
export const VideoRequest = t.strict({
  prompt: t.string,
  model: ModelId,
  duration: t.number.pipe(t.positive()),
  aspectRatio: t.union([t.literal('16:9'), t.literal('9:16'), t.literal('1:1')]),
  userId: t.string,
  metadata: t.partial({
    style: t.string,
    quality: t.union([t.literal('low'), t.literal('medium'), t.literal('high')])
  })
})
```

### 2. Result/Either Types
Implement functional error handling:

```typescript
export type Left<L> = { _tag: 'Left'; value: L }
export type Right<R> = { _tag: 'Right'; value: R }
export type Either<L, R> = Left<L> | Right<R>

export type Task<A> = () => Promise<A>
export type TaskEither<E, A> = () => Promise<Either<E, A>>

export const tryCatch = <A>(task: Promise<A>): TaskEither<Error, A> =>
  async () => {
    try {
      const value = await task
      return { _tag: 'Right', value }
    } catch (error) {
      return { _tag: 'Left', error instanceof Error ? error : new Error(String(error)) }
    }
  }
```

### 3. Function Composition
Create pipe and flow utilities:

```typescript
export const pipe = <T, R>(...fns: Array<(arg: T) => R>) =>
  (value: T): R => fns.reduce((acc, fn) => fn(acc), value)

export const flow = <T, R>(...fns: Array<(arg: T) => R>) =>
  (value: T): R => fns.reduceRight((acc, fn) => fn(acc), value)
```

### 4. Validation Pipeline
Create composable validation:

```typescript
export const validateVideoRequest = (input: unknown): TaskEither<ValidationError, VideoRequest> =>
  tryCatch(
    Promise.resolve(VideoRequest.decode(input)).then(
      result => {
        if (result._tag === 'Left') {
          throw new ValidationError('Invalid video request', result.right)
        }
        return result.right
      }
    )
  )
```

## Output Structure
```
src/core/functional/
├── types/
│   ├── media.types.ts
│   ├── provider.types.ts
│   └── pipeline.types.ts
├── utils/
│   ├── result.ts (Either/Result types)
│   ├── validation.ts (io-ts schemas)
│   ├── composition.ts (pipe/flow)
│   └── promises.ts (Task/TaskEither)
└── testing/
    ├── mocks/
    ├── fixtures/
    └── generators/
```

## Success Criteria
- [ ] All types defined with io-ts
- [ ] All functions are pure
- [ ] 100% type safety
- [ ] Immutability enforced
- [ ] Error handling is functional
- [ ] Pipeline composition works
- [ ] Documentation complete
- [ ] Tests written (100% coverage)

## Testing Requirements
Write unit tests for:
- All type validations
- All utility functions
- All composition helpers
- Error handling cases
- Pipeline composition

Use Vitest and fast-check for property-based testing.
