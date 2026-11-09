import { describe, expect, it } from 'vitest';
import {
  EUROPE_COUNTRIES,
  MAP_HEIGHT,
  MAP_HUBS,
  MAP_WIDTH,
  projectLocation,
} from './europe-map-data';

type Point = { x: number; y: number };

function country(id: string) {
  const result = EUROPE_COUNTRIES.find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing country: ${id}`);
  return result;
}

function rings(path: string): Point[][] {
  return path
    .split('Z')
    .filter(Boolean)
    .map((ring) =>
      [...ring.matchAll(/[ML](-?\d+\.\d),(-?\d+\.\d)/g)].map((match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
      })),
    );
}

function contains(ring: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function edges(path: string): Set<string> {
  return new Set(
    rings(path).flatMap((ring) =>
      ring.map((point, index) =>
        [point, ring[(index + 1) % ring.length]]
          .map(({ x, y }) => `${x},${y}`)
          .sort()
          .join(':'),
      ),
    ),
  );
}

describe('offline European map geometry', () => {
  it('exports the viewport and exact Mercator origin', () => {
    expect(MAP_WIDTH).toBe(900);
    expect(MAP_HEIGHT).toBe(500);
    expect(projectLocation(-13, 61)).toEqual({ x: 330, y: 15 });
  });

  it.each([
    [-10, 36],
    [2.3522, 48.8566],
    [4.3517, 50.8503],
    [30, 70],
  ])('projects %s, %s without flattening latitude or clamping', (longitude, latitude) => {
    const projected = projectLocation(longitude, latitude);
    const mercatorDegrees = (degrees: number) =>
      (Math.asinh(Math.tan((degrees * Math.PI) / 180)) * 180) / Math.PI;
    expect(projected.x).toBeCloseTo(330 + (longitude + 13) * 11, 10);
    expect(projected.y).toBeCloseTo(
      15 + (mercatorDegrees(61) - mercatorDegrees(latitude)) * 11,
      10,
    );
  });

  it('includes the requested countries with unique uppercase ISO2 highlight ids', () => {
    const required = [
      'FR',
      'ES',
      'PT',
      'GB',
      'IE',
      'BE',
      'NL',
      'LU',
      'DE',
      'CH',
      'IT',
      'AT',
      'DK',
      'NO',
      'SE',
      'FI',
      'PL',
      'CZ',
      'SK',
      'HU',
      'SI',
      'HR',
      'BA',
      'RS',
      'ME',
      'AL',
      'GR',
      'RO',
      'BG',
      'UA',
      'BY',
      'LT',
      'LV',
      'EE',
      'MD',
      'MK',
      'XK',
      'TR',
      'RU',
      'IS',
      'TN',
      'DZ',
      'MA',
    ];
    expect(EUROPE_COUNTRIES.map(({ id }) => id).sort()).toEqual(required.sort());
    expect(new Set(EUROPE_COUNTRIES.map(({ id }) => id)).size).toBe(EUROPE_COUNTRIES.length);
    expect(country('FR').name).toBe('France');
    expect(country('BE').name).toBe('Belgium');
    expect(country('ES').name).toBe('Spain');
  });

  it('contains only finite, closed polygon paths rounded to one decimal and stays small', () => {
    for (const { path } of EUROPE_COUNTRIES) {
      expect(path).toMatch(/^(?:M-?\d+\.\d,-?\d+\.\d(?:L-?\d+\.\d,-?\d+\.\d){2,}Z)+$/);
      expect(
        rings(path)
          .flat()
          .every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
      ).toBe(true);
    }
    expect(JSON.stringify(EUROPE_COUNTRIES).length).toBeLessThan(80_000);
  });

  it('retains source islands and excludes French overseas polygons', () => {
    expect(rings(country('FR').path)).toHaveLength(2);
    expect(rings(country('IT').path)).toHaveLength(3);
    expect(rings(country('GB').path)).toHaveLength(2);
    expect(rings(country('GR').path)).toHaveLength(2);
    expect(rings(country('DK').path)).toHaveLength(2);
    const france = rings(country('FR').path).flat();
    expect(france.every(({ x, y }) => x > 400 && x < 600 && y > 200 && y < 380)).toBe(true);
    const sourceVertex = projectLocation(6.18632, 49.463803);
    expect(
      country('FR').path.startsWith(`M${sourceVertex.x.toFixed(1)},${sourceVertex.y.toFixed(1)}`),
    ).toBe(true);
  });

  it.each([
    ['FR', 'BE'],
    ['FR', 'ES'],
    ['ES', 'PT'],
    ['BE', 'NL'],
    ['FR', 'DE'],
  ])('preserves identical shared boundary segments between %s and %s', (first, second) => {
    const firstEdges = edges(country(first).path);
    const secondEdges = edges(country(second).path);
    expect([...firstEdges].filter((edge) => secondEdges.has(edge)).length).toBeGreaterThan(1);
  });

  it('leaves geometry outside the viewport for SVG clipping rather than distorting boundaries', () => {
    expect(
      rings(country('NO').path)
        .flat()
        .some(({ y }) => y < 0),
    ).toBe(true);
    expect(
      rings(country('DZ').path)
        .flat()
        .some(({ y }) => y > MAP_HEIGHT),
    ).toBe(true);
    expect(
      rings(country('UA').path)
        .flat()
        .some(({ x }) => x > MAP_WIDTH),
    ).toBe(true);
  });

  it.each([
    ['france', 'FR', 2.3522, 48.8566],
    ['belgium', 'BE', 4.3517, 50.8503],
    ['spain', 'ES', -3.7038, 40.4168],
    ['port', 'NL', 4.4777, 51.9244],
  ] as const)('locates the illustrative %s hub inside %s', (hub, id, longitude, latitude) => {
    expect(MAP_HUBS[hub]).toEqual(projectLocation(longitude, latitude));
    expect(rings(country(id).path).some((ring) => contains(ring, MAP_HUBS[hub]))).toBe(true);
    expect(MAP_HUBS[hub].x).toBeGreaterThan(0);
    expect(MAP_HUBS[hub].x).toBeLessThan(MAP_WIDTH);
    expect(MAP_HUBS[hub].y).toBeGreaterThan(0);
    expect(MAP_HUBS[hub].y).toBeLessThan(MAP_HEIGHT);
  });
});
