/**
 * placeLabels.ts — which place names a zoom has room for.
 *
 * WHY THIS IS A RULE AND NOT A RANKING
 *
 * The atlas publishes 1 005 cities and towns and no order over them
 * (atlas/datasets/places.py). Drawing all of them at once is a grey smear, so
 * something has to choose — and that choice is a PRESENTATION decision made
 * here, from the population OSM publishes, rather than a "biggest cities" list
 * published as though a publisher had made it (CLAUDE.md §1).
 *
 * The rule, which the interface states:
 *
 *   a place appears once the map is close enough for its published population
 *   a place with NO published population waits for the closest band, because
 *   there is nothing to compare it on — not because it is small
 *   a place whose label would land on one already drawn is left out, larger
 *   published population first
 *   and never more than `CAP` at once
 *
 * WHY A CAP, AND WHY THE SPACING IS HERE
 *
 * Each label is a DOM element following the map. MapLibre draws text from glyph
 * atlases that this project does not ship and will not fetch from someone
 * else's server, so labels are markers — and two things come with that. A few
 * hundred markers moving with a pan is the difference between a map and a
 * slideshow, hence the cap. And nothing collides them: a symbol layer drops a
 * label that would overlap another, and markers happily draw
 * "F.B. Üsküdar-e" on top of "Pendik" over İstanbul. So the spacing is done
 * here, in the same place and by the same rule as everything else.
 */

/** What a label needs to know about a place. */
export interface Labelled {
  id: string;
  population: number | null;
  point: [number, number];
}

/** The most labels on screen at once, whatever the zoom. */
export const CAP = 140;

/**
 * The population a place needs to be drawn at a given zoom.
 *
 * Read as: below zoom 5.5, half a million; below 6.5, two hundred thousand, and
 * so on. Past the last band every place qualifies, including the 160 with no
 * published population.
 */
const FLOORS: Array<[number, number]> = [
  [5.5, 500_000],
  [6.5, 200_000],
  [7.5, 75_000],
  [8.5, 25_000],
];

/** The population floor at a zoom, or 0 once every place qualifies. */
export function floorAt(zoom: number): number {
  for (const [under, floor] of FLOORS) if (zoom < under) return floor;
  return 0;
}

/**
 * How much room a label needs, in screen pixels.
 *
 * A label is wide and short, so the test is a box rather than a circle: two
 * names can sit close above one another and cannot sit close side by side.
 */
const APART_X = 78;
const APART_Y = 13;

/** Whether a point is inside [west, south, east, north]. */
function within(point: [number, number], box: [number, number, number, number]): boolean {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];
}

/**
 * Degrees of longitude per screen pixel at a zoom, and of latitude beside it.
 *
 * Web Mercator: the world is 256·2^zoom pixels around, and a degree of latitude
 * is shorter on screen the further from the equator — by cos(φ), which at
 * Turkish latitudes is about 0.76 and is worth having rather than not.
 */
function perPixel(zoom: number, latitude: number): [number, number] {
  const across = 360 / (256 * Math.pow(2, zoom));
  return [across, across * Math.cos((latitude * Math.PI) / 180)];
}

/** Whether `point` would land on top of a label already placed. */
function clear(
  point: [number, number],
  taken: Array<[number, number]>,
  zoom: number,
): boolean {
  const [lonPer, latPer] = perPixel(zoom, point[1]);
  for (const other of taken) {
    const dx = Math.abs(point[0] - other[0]) / lonPer;
    const dy = Math.abs(point[1] - other[1]) / latPer;
    if (dx < APART_X && dy < APART_Y) return false;
  }
  return true;
}

/**
 * The places to label right now: in view, big enough for this zoom, capped.
 *
 * Sorted by published population, largest first, so the cap drops the smallest
 * rather than whichever happened to be last in the file. Ties and places with
 * no population break on the id, which keeps the same map on a second pan
 * across the same ground.
 */
export function labelsFor<T extends Labelled>(
  places: T[],
  zoom: number,
  box: [number, number, number, number],
  cap: number = CAP,
): T[] {
  const floor = floorAt(zoom);
  const wanted = places
    .filter((place) => within(place.point, box))
    .filter((place) => (floor === 0 ? true : (place.population ?? 0) >= floor))
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.id.localeCompare(b.id));

  const drawn: T[] = [];
  const taken: Array<[number, number]> = [];
  for (const place of wanted) {
    if (drawn.length >= cap) break;
    if (!clear(place.point, taken, zoom)) continue;
    drawn.push(place);
    taken.push(place.point);
  }
  return drawn;
}
