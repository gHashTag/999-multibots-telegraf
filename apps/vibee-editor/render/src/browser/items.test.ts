import { describe, it, expect } from 'vitest'
import { itemsOf, itemLine, itemsProbe, MAX_ITEMS } from './items'

describe('what the page says, as rows', () => {
  it('reads the rows the probe returns, and folds their whitespace', () => {
    const got = itemsOf(
      JSON.stringify([
        {
          title: '  Invitation   to\nan interview ',
          text: 'FPGA engineer, Moscow',
          when: '2 hours ago',
          href: '/negotiations/1',
        },
      ])
    )
    expect(got).toEqual([
      {
        title: 'Invitation to an interview',
        text: 'FPGA engineer, Moscow',
        when: '2 hours ago',
        href: '/negotiations/1',
      },
    ])
  })

  it('carries at most a handful, and drops rows with nothing in them', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      title: `row ${i}`,
      text: 't',
    }))
    expect(itemsOf(JSON.stringify(many))).toHaveLength(MAX_ITEMS)
    expect(itemsOf(JSON.stringify([{ title: '', text: '' }, null, 7]))).toEqual(
      []
    )
  })

  it('a page that answers with rubbish is a page with no rows', () => {
    expect(itemsOf('not json')).toEqual([])
    expect(itemsOf(undefined)).toEqual([])
    expect(itemsOf({ nope: true })).toEqual([])
  })

  it('a line names the thing and, when the page said so, its time', () => {
    expect(
      itemLine({ title: 'Invitation', text: 'x', when: '2h', href: '' })
    ).toBe('Invitation (2h)')
    expect(
      itemLine({ title: '', text: 'no heading here', when: '', href: '' })
    ).toBe('no heading here')
    expect(
      itemLine({ title: 'T'.repeat(200), text: '', when: '', href: '' }).length
    ).toBe(80)
  })

  it('the probe is a single expression, and asks for no more than it needs', () => {
    const src = itemsProbe(3)
    expect(() => new Function(`return ${src}`)).not.toThrow()
    expect(src).toContain('out.length >= 3')
  })
})
