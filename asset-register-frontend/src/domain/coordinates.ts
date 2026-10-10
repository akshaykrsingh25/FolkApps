export interface LatitudeLongitude {
  latitude: number;
  longitude: number;
}

export function isWithinIndia(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= 6.5 && latitude <= 37.5
    && Number.isFinite(longitude) && longitude >= 68 && longitude <= 98;
}

export function parseLatitudeLongitude(value: string): LatitudeLongitude | null {
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}
