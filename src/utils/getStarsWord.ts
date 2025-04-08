/**
 * Returns the correct word form for 'star' based on the number and language
 * @param count - The number of stars
 * @param isRu - Whether to return Russian (true) or English (false) word form
 * @returns The correct word form for 'star'
 */
export function getStarsWord(count: number, isRu: boolean): string {
  if (isRu) {
    // Russian word forms: звезда, звезды, звёзд
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return 'звёзд';
    }

    if (lastDigit === 1) {
      return 'звезда';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return 'звезды';
    }

    return 'звёзд';
  } else {
    // English word forms: star, stars
    return count === 1 ? 'star' : 'stars';
  }
} 