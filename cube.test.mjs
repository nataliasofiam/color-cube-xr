// node cube.test.mjs — the color cube's rules, as in the Unity version's tests.
import assert from 'node:assert/strict';
import { ColorCube } from './cube.js';

const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-4, `${msg}: ${a} vs ${b}`));

{ // Sliding along a face changes only its two channels.
  const cube = new ColorCube([1, 0.5, 0.5], 0, true);
  assert.equal(cube.move(0.3, 0.2, -0.1), false);
  near(cube.color, [1, 0.7, 0.4], 'slide');
}
{ // Going past an edge carries on over it onto the next face.
  const cube = new ColorCube([1, 0.5, 0.5], 0, true);
  assert.equal(cube.move(0, 0.7, 0), true);
  assert.equal(cube.axis, 1); assert.equal(cube.high, true);
  near(cube.color, [0.8, 1, 0.5], 'over the edge');
  // And over the black side: from the green face past blue's bottom edge, onto the face where blue is 0.
  assert.equal(cube.move(0, 0, -0.6), true);
  assert.equal(cube.axis, 2); assert.equal(cube.high, false);
  assert.ok(Math.abs(cube.color[1] - 0.9) < 1e-4);
}
{ // A small move across an edge is a small change of color.
  const cube = new ColorCube([1, 0.99, 0.3], 0, true);
  const before = cube.color; cube.move(0, 0.02, 0); const after = cube.color;
  assert.ok(Math.abs(before[0] - after[0]) < 0.02 && Math.abs(before[1] - after[1]) < 0.02);
}
{ // Pushing into the face does nothing.
  const cube = new ColorCube([0.2, 0.4, 0], 2, false);
  assert.equal(cube.move(0, 0, 0.5), false);
  near(cube.color, [0.2, 0.4, 0], 'push');
}
console.log('color cube: all passed');
