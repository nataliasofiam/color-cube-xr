// Where the ring sits on the surface of the color cube, whose every point is its own color: red, green and blue
// along its three edges from the black corner. Neighboring faces share an edge, so colors blend from one face onto
// the next. Moved past an edge, the ring goes over it onto the next face, as a finger sliding round the cube would.
export class ColorCube {
  /** Starts on the face where channel `axis` (0 red, 1 green, 2 blue) is at 1 when `high`, or else 0. */
  constructor([r, g, b], axis, high) {
    this.point = [r, g, b].map(clamp01);
    this.axis = axis;
    this.high = high;
    this.point[axis] = high ? 1 : 0;
  }

  get color() { return [...this.point]; }

  /** Slides the ring this far in the cube's own space. Only what lies along the face counts. True when it went onto another face. */
  move(dr, dg, db) {
    const delta = [dr, dg, db];
    delta[this.axis] = 0;
    // Along the face first, then over the one edge it reaches, if any.
    let over = -1;
    for (let i = 0; i < 3; i++) {
      if (i === this.axis) continue;
      const next = this.point[i] + delta[i];
      if (next >= 0 && next <= 1) this.point[i] = next;
      else if (over < 0 || Math.abs(delta[i]) > Math.abs(delta[over])) over = i;
    }
    if (over < 0) return false;
    const target = this.point[over] + delta[over];
    const high = target > 1;
    const beyond = high ? target - 1 : -target;
    this.point[over] = high ? 1 : 0;
    const inward = Math.min(beyond, 1);
    this.point[this.axis] = this.high ? 1 - inward : inward;
    this.axis = over;
    this.high = high;
    return true;
  }
}

/** A point in or on the cube, 0 to 1 each way, as the face it's nearest; near the current face (within `stick`), it stays there so an edge doesn't flicker. */
export function faceAt(point, current, stick) {
  let axis = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(point[i] - 0.5) > Math.abs(point[axis] - 0.5)) axis = i;
  let high = point[axis] > 0.5;
  if (current && Math.abs(point[current.axis] - (current.high ? 1 : 0)) <= stick) ({ axis, high } = current);
  return { axis, high };
}

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
