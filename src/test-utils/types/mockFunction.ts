export interface IMockFunction<T extends (...args: any[]) => any> extends T {
  mock: {
    calls: Parameters<T>[]
    results: Array<{ type: 'return' | 'throw'; value: any }>
    instances: any[]
    invocationCallOrder: number[]
    lastCall?: Parameters<T>
    implementation?: T
  }
  mockClear: () => IMockFunction<T>
  mockReset: () => IMockFunction<T>
  mockImplementation: (fn: T) => IMockFunction<T>
  mockImplementationOnce: (fn: T) => IMockFunction<T>
  mockReturnValue: (value: ReturnType<T>) => IMockFunction<T>
  mockReturnValueOnce: (value: ReturnType<T>) => IMockFunction<T>
  mockResolvedValue: <U>(value: U) => IMockFunction<T>
  mockRejectedValue: (error: Error) => IMockFunction<T>
  mockReturnThis?: () => IMockFunction<T>
}
