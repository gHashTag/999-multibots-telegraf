import { delay } from '@/helpers/delay';

jest.useFakeTimers();

describe('delay', () => {
  test('resolves after the specified time', async () => {
    const callback = jest.fn();
    const promise = delay(100);
    promise.then(callback);
    jest.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalled();
  });
});