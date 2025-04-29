// src/__tests__/example.test.ts
import { describe, it, expect, test } from 'bun:test'

// Пример простого теста
describe('Math operations', () => {
  test('should add two numbers correctly', () => {
    expect(1 + 1).toBe(2)
  })

  test('should subtract two numbers correctly', () => {
    expect(5 - 3).toBe(2)
  })
})
