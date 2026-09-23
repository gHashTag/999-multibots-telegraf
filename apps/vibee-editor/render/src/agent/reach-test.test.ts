import { describe, it, expect } from 'vitest'
import { whatTheNumbersSay, ENOUGH, type Posted } from './reach-test'

const post = (shape: 'thread' | 'single', reach: number | null): Posted => ({
  slug: Math.random().toString(36).slice(2),
  shape,
  at: '2026-09-23T12:00:00Z',
  reach,
})

describe('what the numbers say about the reader s hypothesis', () => {
  it('says plainly when there is nothing to compare yet', () => {
    const v = whatTheNumbersSay([post('thread', 100), post('single', 90)])
    expect(v.says).toContain('нечего сравнивать')
    expect(v.threads).toBe(1)
  })

  it('a post with no number is an unanswered question, not a zero', () => {
    const v = whatTheNumbersSay([
      ...Array.from({ length: ENOUGH }, () => post('thread', 200)),
      ...Array.from({ length: ENOUGH }, () => post('single', 100)),
      post('thread', null),
      post('single', null),
    ])
    expect(v.threads).toBe(ENOUGH)
    expect(v.singles).toBe(ENOUGH)
    expect(v.medianThread).toBe(200)
  })

  it('compares medians once there are enough of each, and says by how much', () => {
    const v = whatTheNumbersSay([
      post('thread', 300),
      post('thread', 200),
      post('thread', 250),
      post('single', 100),
      post('single', 120),
      post('single', 80),
    ])
    expect(v.medianThread).toBe(250)
    expect(v.medianSingle).toBe(100)
    expect(v.says).toContain('+150%')
  })

  it('an honest minus when the hypothesis is wrong', () => {
    const v = whatTheNumbersSay([
      post('thread', 50),
      post('thread', 60),
      post('thread', 40),
      post('single', 100),
      post('single', 110),
      post('single', 90),
    ])
    expect(v.says).toContain('-50%')
  })
})
