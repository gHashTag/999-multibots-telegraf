import { voiceConversationCost } from '../../src/price/helpers/voiceConversationCost'
import { calculateCostInStars } from '../../src/price/helpers/calculateCostInStars'

describe('voiceConversationCost constant', () => {
  it('should equal calculateCostInStars(0.99)', () => {
    const expected = calculateCostInStars(0.99)
    expect(voiceConversationCost).toBeCloseTo(expected)
  })
})
