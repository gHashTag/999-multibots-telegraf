export type MockFunction<T extends (...args: any[]) => any> = T & {
  mock: {
    calls: Parameters<T>[];
    results: ReturnType<T>[];
    instances: any[];
    invocationCallOrder: number[];
    lastCall: Parameters<T>;
  };
  mockClear: () => void;
  mockReset: () => void;
  mockImplementation: (fn: T) => MockFunction<T>;
  mockImplementationOnce: (fn: T) => MockFunction<T>;
  mockReturnValue: (value: ReturnType<T>) => MockFunction<T>;
  mockReturnValueOnce: (value: ReturnType<T>) => MockFunction<T>;
}; 