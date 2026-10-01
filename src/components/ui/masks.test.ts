import { maskDate, maskTime } from './masks';

describe('maskDate', () => {
  it('adds dashes as digits are typed', () => {
    expect(maskDate('1')).toBe('1');
    expect(maskDate('1988')).toBe('1988');
    expect(maskDate('19880')).toBe('1988-0');
    expect(maskDate('198804')).toBe('1988-04');
    expect(maskDate('1988041')).toBe('1988-04-1');
    expect(maskDate('19880412')).toBe('1988-04-12');
  });

  it('is stable when its own output is fed back in, which is what a controlled input does', () => {
    expect(maskDate('1988-04-12')).toBe('1988-04-12');
    expect(maskDate('1988-0')).toBe('1988-0');
  });

  it('drops a dash when the user backspaces over it', () => {
    expect(maskDate('1988-')).toBe('1988');
  });

  it('ignores letters and anything past eight digits', () => {
    expect(maskDate('19a88x')).toBe('1988');
    expect(maskDate('198804129999')).toBe('1988-04-12');
    expect(maskDate('')).toBe('');
  });
});

describe('maskTime', () => {
  it('adds the colon as digits are typed', () => {
    expect(maskTime('0')).toBe('0');
    expect(maskTime('09')).toBe('09');
    expect(maskTime('093')).toBe('09:3');
    expect(maskTime('0930')).toBe('09:30');
    expect(maskTime('09:30')).toBe('09:30');
    expect(maskTime('09:')).toBe('09');
    expect(maskTime('093099')).toBe('09:30');
  });
});
