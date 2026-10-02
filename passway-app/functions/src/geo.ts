import * as ngeohash from 'ngeohash';
import { GEOHASH_PRECISION } from './constants';

export function encodeGeohash(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, GEOHASH_PRECISION);
}

// The cell itself plus its 8 neighbors, so a redemption near a cell
// boundary is not rejected just because of which side it landed on.
// This is what absorbs normal GPS drift, especially indoors or
// underground, without opening the door to remote guessing.
export function cellAndNeighbors(hash: string): string[] {
  return [hash, ...ngeohash.neighbors(hash)];
}
