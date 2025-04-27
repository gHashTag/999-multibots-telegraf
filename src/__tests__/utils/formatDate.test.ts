// src/__tests__/utils/formatDate.test.ts
import { describe, it, expect } from 'vitest'
import { formatDate } from '@/utils/formatDate'

describe('formatDate', () => {
  it('should format a valid date string correctly (YYYY-MM-DD HH:MM)', () => {
    const dateString = '2024-08-16T12:30:55.123Z'
    const expectedFormat = '2024-08-16 12:30' // Assuming it truncates seconds
    expect(formatDate(dateString)).toBe(expectedFormat)
  })

  it('should format a Date object correctly', () => {
    // Note: Timezone differences might affect the exact hour/minute depending on test runner env
    // It's often better to test with UTC or mock the Date object
    const dateObject = new Date('2023-01-05T08:05:10.000Z')
    const expectedFormat = '2023-01-05 08:05'
    expect(formatDate(dateObject)).toBe(expectedFormat)
  })

  it('should handle single digit month and day correctly', () => {
    const dateString = '2024-03-01T05:09:00.000Z'
    const expectedFormat = '2024-03-01 05:09'
    expect(formatDate(dateString)).toBe(expectedFormat)
  })

  it('should return an empty string or default value for invalid date input', () => {
    const invalidString = 'not a date'
    const expectedOutput = '' // Or whatever the function is designed to return
    expect(formatDate(invalidString)).toBe(expectedOutput)
    expect(formatDate(null)).toBe(expectedOutput)
    expect(formatDate(undefined)).toBe(expectedOutput)
    expect(formatDate({} as any)).toBe(expectedOutput) // Test unexpected types
  })

  // Add tests for different timezones if the function handles them specifically
  // Add tests for different locales if formatting changes based on locale
}) 