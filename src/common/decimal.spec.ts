import { toApiNumber } from './decimal.js';

describe('toApiNumber', () => {
  it('rounds to 2 decimals by default', () => {
    expect(toApiNumber('61.23496995')).toBe(61.23);
  });

  it('rounds half up', () => {
    expect(toApiNumber('0.125')).toBe(0.13);
  });

  it('keeps whole numbers as is', () => {
    expect(toApiNumber('100.000000')).toBe(100);
  });

  it('supports a custom number of decimals', () => {
    expect(toApiNumber('103.333333', 1)).toBe(103.3);
  });
});
