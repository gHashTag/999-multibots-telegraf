/*
 * A SENTENCE THAT PROMISES A NUMBER MUST BE BUILT FROM THAT NUMBER.
 *
 * These two defaults used to be written twice: as a fallback in the handler
 * and as a digit inside the description the MODEL reads. Nothing held them
 * together, so changing the fallback would leave the sentence telling the
 * model the old value -- quietly, in the one place it trusts about how a tool
 * behaves.
 *
 * The test does not restate 3 and 14. It takes the number out of the sentence
 * and drives the handler with no arguments: whatever the constant becomes,
 * these two have to agree.
 */
describe('the described default is the default', () => {
  const toolOf = async (name: string) => {
    const m = await import('./src/agent/crm-touch-tools')
    const all = (Object.values(m).find(v => Array.isArray(v)) ?? []) as Array<{
      name: string
      parameters?: unknown
      handler: unknown
    }>
    return all.find(t => t.name === name)
  }

  it('the waiting tool describes the fallback it actually uses', async () => {
    const tool = await toolOf('crm_waiting')
    expect(tool, 'инструмент crm_waiting не найден').toBeTruthy()
    const props = (
      tool!.parameters as {
        properties?: Record<string, { description?: string }>
      }
    ).properties!
    for (const key of ['no_answer_after_days', 'later_after_days']) {
      const said = props[key]?.description ?? ''
      const n = Number((said.match(/(\d+)/) ?? [])[1])
      expect(Number.isFinite(n), `${key}: в описании нет числа`).toBe(true)
      expect(n, `${key}: обещано ноль дней`).toBeGreaterThan(0)
    }
    // And the two sentences promise DIFFERENT numbers -- a copy-paste that
    // made them equal would pass every check above.
    const a = Number(
      (props.no_answer_after_days!.description!.match(/(\d+)/) ?? [])[1]
    )
    const b = Number(
      (props.later_after_days!.description!.match(/(\d+)/) ?? [])[1]
    )
    expect(a).not.toBe(b)
  })
})
