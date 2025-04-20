import { calculateStars } from '@/price/helpers/calculateStars';

describe('calculateStars', () => {
  it('floors the division of payment by star cost', () => {
    expect(calculateStars(10, 3)).toBe(3);
  });

  it('returns zero when payment less than star cost', () => {
    expect(calculateStars(2, 5)).toBe(0);
  });

  it('exact division returns exact result', () => {
    expect(calculateStars(15, 5)).toBe(3);
  });
});