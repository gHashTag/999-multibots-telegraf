import { describe, it, expect } from '@jest/globals'
import { cancelHelpArray } from '@/menu/cancelHelpArray'

describe('cancelHelpArray', () => {
  it('returns Russian array when isRu true', () => {
    const arr = cancelHelpArray(true)
    expect(arr).toEqual([
      ['Справка по команде'],
      ['Отмена'],
    ])
  })

  it('returns English array when isRu false', () => {
    const arr = cancelHelpArray(false)
    expect(arr).toEqual([
      ['Help for the command'],
      ['Cancel'],
    ])
  })
})