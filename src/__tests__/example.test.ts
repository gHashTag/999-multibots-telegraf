// src/__tests__/example.test.ts
import { describe, it, expect } from 'vitest'

// Пример простого теста
describe('Math operations', () => {
  it('should add two numbers correctly', () => {
    expect(1 + 1).toBe(2)
  })

  it('should subtract two numbers correctly', () => {
    expect(5 - 3).toBe(2)
  })
})
