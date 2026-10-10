import { describe, expect, it } from 'vitest';
import { isWithinIndia, parseLatitudeLongitude } from './coordinates';

describe('parseLatitudeLongitude', () => {
  it('parses a copied latitude, longitude pair with spaces', () => {
    expect(parseLatitudeLongitude(' 28.4595, 77.0266 ')).toEqual({ latitude: 28.4595, longitude: 77.0266 });
  });

  it('accepts signed coordinates and decimal values without a leading zero', () => {
    expect(parseLatitudeLongitude('-.5, +.25')).toEqual({ latitude: -0.5, longitude: 0.25 });
  });

  it('rejects place names, map URLs, incomplete pairs, and out-of-range values', () => {
    expect(parseLatitudeLongitude('Gurugram, India')).toBeNull();
    expect(parseLatitudeLongitude('https://maps.google.com/@28.4,77.0')).toBeNull();
    expect(parseLatitudeLongitude('28.4')).toBeNull();
    expect(parseLatitudeLongitude('91, 181')).toBeNull();
  });

  it('keeps confirmed pins inside the India map bounds', () => {
    expect(isWithinIndia(28.4595, 77.0266)).toBe(true);
    expect(isWithinIndia(40.7128, -74.006)).toBe(false);
    expect(isWithinIndia(0, 77)).toBe(false);
  });
});
