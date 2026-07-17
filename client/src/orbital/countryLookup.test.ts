import { describe, it, expect } from 'vitest';
import { pointInRing, pointInPolygon, pointInMultiPolygon, computeBBox, findCountryAt, type CountryFeature } from './countryLookup';

const SQUARE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];

const HOLE: [number, number][] = [
  [3, 3],
  [7, 3],
  [7, 7],
  [3, 7],
  [3, 3],
];

describe('pointInRing', () => {
  it('is true for a point inside a simple square', () => {
    expect(pointInRing(5, 5, SQUARE)).toBe(true);
  });

  it('is false for a point outside the square', () => {
    expect(pointInRing(20, 20, SQUARE)).toBe(false);
  });

  it('is false for a point just outside an edge', () => {
    expect(pointInRing(11, 5, SQUARE)).toBe(false);
  });
});

// A compact rectangle straddling the antimeridian, in the same style as
// Fiji's real second polygon part: raw coordinates jump from 178 to -179
// between consecutive vertices, describing a small region actually
// centered near the dateline (178E to 179W, lat -19 to -16) rather than
// spanning the globe.
const DATELINE_RING: [number, number][] = [
  [178, -19],
  [-179, -19],
  [-179, -16],
  [178, -16],
  [178, -19],
];

describe('pointInRing (antimeridian-crossing ring)', () => {
  it('matches a point just east of the dateline, inside the ring', () => {
    expect(pointInRing(179, -17.5, DATELINE_RING)).toBe(true);
  });

  it('matches the same real-world area expressed just west of the dateline', () => {
    expect(pointInRing(-179.5, -17.5, DATELINE_RING)).toBe(true);
  });

  it('does not match a point far away at an unrelated longitude', () => {
    // Regression: a naive raw-coordinate ray-cast treats the 178 -> -179
    // vertex jump as a near-global edge, which was confirmed to make Fiji's
    // real geometry falsely match points over South America.
    expect(pointInRing(-75, -17, DATELINE_RING)).toBe(false);
  });

  it('rejects a point at the right longitude but outside the ring band', () => {
    expect(pointInRing(179, 10, DATELINE_RING)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  it('excludes points inside a hole', () => {
    expect(pointInPolygon(5, 5, [SQUARE, HOLE])).toBe(false);
  });

  it('includes points inside the outer ring but outside the hole', () => {
    expect(pointInPolygon(1, 1, [SQUARE, HOLE])).toBe(true);
  });

  it('excludes points entirely outside the outer ring', () => {
    expect(pointInPolygon(50, 50, [SQUARE, HOLE])).toBe(false);
  });
});

describe('pointInMultiPolygon', () => {
  const OTHER_SQUARE: [number, number][] = [
    [100, 100],
    [110, 100],
    [110, 110],
    [100, 110],
    [100, 100],
  ];

  it('is true if the point falls in any constituent polygon', () => {
    expect(pointInMultiPolygon(105, 105, [[SQUARE], [OTHER_SQUARE]])).toBe(true);
    expect(pointInMultiPolygon(5, 5, [[SQUARE], [OTHER_SQUARE]])).toBe(true);
  });

  it('is false if the point falls in neither', () => {
    expect(pointInMultiPolygon(-50, -50, [[SQUARE], [OTHER_SQUARE]])).toBe(false);
  });
});

describe('computeBBox', () => {
  it('computes the bounding box of a Polygon geometry', () => {
    expect(computeBBox({ type: 'Polygon', coordinates: [SQUARE] })).toEqual([0, 0, 10, 10]);
  });

  it('computes the union bounding box of a MultiPolygon geometry', () => {
    const bbox = computeBBox({
      type: 'MultiPolygon',
      coordinates: [
        [SQUARE],
        [
          [
            [100, 100],
            [110, 100],
            [110, 110],
            [100, 110],
            [100, 100],
          ],
        ],
      ],
    });
    expect(bbox).toEqual([0, 0, 110, 110]);
  });
});

describe('findCountryAt', () => {
  const countries: CountryFeature[] = [
    { name: 'Squareland', geometry: { type: 'Polygon', coordinates: [SQUARE] }, bbox: computeBBox({ type: 'Polygon', coordinates: [SQUARE] }) },
  ];

  it('finds the country containing the point', () => {
    expect(findCountryAt(5, 5, countries)).toBe('Squareland');
  });

  it('returns null when the point is over open ocean (no country contains it)', () => {
    expect(findCountryAt(-40, -40, countries)).toBeNull();
  });

  it('rejects candidates outside the bbox without running the precise test', () => {
    expect(findCountryAt(500, 500, countries)).toBeNull();
  });
});
