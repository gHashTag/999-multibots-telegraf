import { describe, it, expect } from 'vitest'
import { withUserBalanceLock } from './balanceLock'

const tick = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('withUserBalanceLock (#999 interim double-spend guard)', () => {
  it('serializes concurrent operations for the same user', async () => {
    const order: string[] = []
    const a = withUserBalanceLock('u1', async () => {
      order.push('a:start')
      await tick(20)
      order.push('a:end')
      return 'a'
    })
    // second is queued while the first is still running
    const b = withUserBalanceLock('u1', async () => {
      order.push('b:start')
      await tick(5)
      order.push('b:end')
      return 'b'
    })
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
    // b must not start until a has finished — no interleaving
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('models the double-spend fix: the second read sees the first write', async () => {
    // Shared balance the two calls read-modify-write, mirroring the real race.
    let balance = 100
    const spend = (cost: number) =>
      withUserBalanceLock('u2', async () => {
        const current = balance // READ
        await tick(10) // window where an unlocked second call would also read 100
        if (current < cost) return false // CHECK
        balance = current - cost // WRITE
        return true
      })
    const [first, second] = await Promise.all([spend(100), spend(100)])
    // Without the lock both would read 100, both pass, balance -> -100.
    expect([first, second].sort()).toEqual([false, true])
    expect(balance).toBe(0) // exactly one spend, never negative
  })

  it('does not wedge the user when an operation throws', async () => {
    const boom = withUserBalanceLock('u3', async () => {
      throw new Error('boom')
    })
    await expect(boom).rejects.toThrow('boom')
    // the next operation for the same user still runs
    const after = await withUserBalanceLock('u3', async () => 'ok')
    expect(after).toBe('ok')
  })

  it('runs different users concurrently (per-user, not global)', async () => {
    const order: string[] = []
    const a = withUserBalanceLock('x', async () => {
      order.push('x:start')
      await tick(20)
      order.push('x:end')
    })
    const b = withUserBalanceLock('y', async () => {
      order.push('y:start')
      await tick(5)
      order.push('y:end')
    })
    await Promise.all([a, b])
    // y finished before x — they overlapped, so y is not blocked behind x
    expect(order.indexOf('y:end')).toBeLessThan(order.indexOf('x:end'))
  })
})
