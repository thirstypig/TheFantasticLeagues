import { describe, it, expect } from 'vitest';
import { shortName } from '../shortName';

describe('shortName', () => {
  it('last name and initial + last name', () => {
    expect(shortName('Bryce Harper', 'last')).toBe('Harper');
    expect(shortName('William Contreras', 'initial')).toBe('W. Contreras');
  });

  it('keeps suffixes with the last name', () => {
    expect(shortName('Lourdes Gurriel Jr.', 'last')).toBe('Gurriel Jr.');
    expect(shortName('Lourdes Gurriel Jr.', 'initial')).toBe('L. Gurriel Jr.');
    expect(shortName('Ken Griffey Sr.', 'last')).toBe('Griffey Sr.');
    expect(shortName('Michael Harris II', 'initial')).toBe('M. Harris II');
    expect(shortName('Cal Ripken III', 'last')).toBe('Ripken III');
    expect(shortName('Bobby Witt Jr', 'last')).toBe('Witt Jr');
  });

  it('keeps particles of multi-word last names', () => {
    expect(shortName('Elly De La Cruz', 'last')).toBe('De La Cruz');
    expect(shortName('Elly De La Cruz', 'initial')).toBe('E. De La Cruz');
  });

  it('middle names are dropped', () => {
    expect(shortName('Jazz Chisholm Jr.', 'last')).toBe('Chisholm Jr.');
    expect(shortName('Juan Carlos Ortiz', 'last')).toBe('Ortiz');
  });

  it('single-word and odd names', () => {
    expect(shortName('Ichiro', 'last')).toBe('Ichiro');
    expect(shortName('Ichiro', 'initial')).toBe('Ichiro');
    expect(shortName('  Shohei   Ohtani ', 'initial')).toBe('S. Ohtani');
    expect(shortName('', 'last')).toBe('');
  });
});
