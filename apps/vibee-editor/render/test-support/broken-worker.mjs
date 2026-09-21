/**
 * A WORKER THAT CANNOT LOAD, for isolated-reader.test.ts: the shape of a
 * deploy that lost a dependency. It throws before it is ready.
 */
throw new Error('this worker cannot start')
