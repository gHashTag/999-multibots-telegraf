import { calculateCostInStars } from '@/price/helpers/calculateCostInStars';
import { starCost } from '@/price';

describe('calculateCostInStars', () => {
  test('returns 0 when costInDollars is 0', () => {
    expect(calculateCostInStars(0)).toBe(0);
  });

  test('returns 1 when costInDollars equals starCost', () => {
    expect(calculateCostInStars(starCost)).toBeCloseTo(1);
  });

  test('calculates correctly for arbitrary cost', () => {
    const dollars = starCost * 5;
    expect(calculateCostInStars(dollars)).toBeCloseTo(5);
  });
});