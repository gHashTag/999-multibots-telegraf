import { createGenerateImageKeyboard } from '@/menu/index'

describe('createGenerateImageKeyboard', () => {
  it('returns correct inline keyboard with generate and cancel buttons', () => {
    const kb = createGenerateImageKeyboard()
    expect(kb).toHaveProperty('inline_keyboard')
    const rows = kb.inline_keyboard
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBe(1)
    const row = rows[0]
    expect(row).toHaveLength(2)
    expect(row[0]).toMatchObject({
      text: 'Сгенерировать',
      callback_data: 'generate_image',
    })
    expect(row[1]).toMatchObject({ text: 'Отмена', callback_data: 'cancel' })
  })
})
