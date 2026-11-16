import { clamp01 } from './cube.js';

// A face broken up into n by n tiles, for a finer pick: the tiles hold a small square of the face's colors (`span`
// each way) around the color it broke up at, shifted to stay inside the cube near an edge. The ring slides across all
// the tiles as it would across the whole face, so the same hand moves through that much less color.
export class FaceGrid {
  constructor(color, axis, high, n = 5, span = 0.2) {
    this.axis = axis;
    this.high = high;
    this.n = n;
    this.span = span;
    this.free = [0, 1, 2].filter((i) => i !== axis);
    this.lo = [0, 0, 0];
    this.p = [0, 0, 0]; // where the ring is across the tiles, 0 to 1 each way along the face, like a point on the cube
    this.p[axis] = high ? 1 : 0;
    const step = span / n;
    for (const i of this.free) {
      // The color itself is one tile, as near the middle as keeps every tile's color inside the cube.
      const fits = (k) => color[i] - k * step >= -1e-9 && color[i] + (n - 1 - k) * step <= 1 + 1e-9;
      const mid = (n - 1) >> 1;
      let k = mid;
      for (let d = 1; !fits(k) && d < n; d++) k = fits(mid - d) ? mid - d : fits(mid + d) ? mid + d : k;
      this.lo[i] = color[i] - (k + 0.5) * step;
      this.p[i] = (k + 0.5) / n;
    }
  }

  cell(v) { return Math.min(this.n - 1, Math.max(0, Math.floor(v * this.n))); }

  /** The tile the ring is on, as its place along each of the face's two ways. */
  get tile() { return this.free.map((i) => this.cell(this.p[i])); }

  /** Tile (a, b)'s color: the middle of its own little square. */
  colorAt(a, b) {
    const c = [0, 0, 0];
    c[this.axis] = this.high ? 1 : 0;
    [a, b].forEach((k, f) => { const i = this.free[f]; c[i] = clamp01(this.lo[i] + ((k + 0.5) / this.n) * this.span); });
    return c;
  }

  /** The color of the tile the ring is on. */
  get color() { return this.colorAt(...this.tile); }

  /** The color right under the ring, between tiles, for going back to the whole face. */
  actual() {
    const c = [...this.p];
    for (const i of this.free) c[i] = clamp01(this.lo[i] + clamp01(this.p[i]) * this.span);
    return c;
  }

  /** Slides the ring this far in the cube's own space. False once it went off the tiles. */
  move(delta, margin = 0.04) {
    for (const i of this.free) this.p[i] += delta[i];
    return this.free.every((i) => this.p[i] >= -margin && this.p[i] <= 1 + margin);
  }

  /** Puts the ring at a point on the face, 0 to 1 each way. */
  set(point) { for (const i of this.free) this.p[i] = clamp01(point[i]); }
}
