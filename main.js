// The color cube rides above the left hand (palm, or a controller's grip), turned to face you. The right hand picks:
// pinch on the cube and slide the ring, over an edge onto the next face, and the cube rolls to bring that face round;
// or touch it with a fingertip, or point a controller and hold the trigger. Without a headset, the mouse does it.
// Its look and feel are in settings.js; ?tune edits them live (tune.js).
import * as THREE from 'three';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ColorCube, faceAt, clamp01 } from './cube.js';
import { FaceGrid } from './grid.js';
import { LOOK, FEEL } from './settings.js';

const L = LOOK, F = FEEL;
const START = [1, 0.2, 0.15]; // on the red face
const GRID_MAX = 7;           // the most tiles each way the meshes have room for

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fromTo = (a, b) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
const deg = THREE.MathUtils.degToRad;
/** A box with its edges rounded off, `roundness` of its edge (0 square, 0.5 a pill all round). */
const roundBox = (size) => L.roundness > 0
  ? new RoundedBoxGeometry(size, size, size, 5, Math.min(0.5, L.roundness) * size)
  : new THREE.BoxGeometry(size, size, size);

// ---- Scene -------------------------------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
// The cube paints itself; the light is for the hand models.
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8076, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(0.5, 1, 0.8); scene.add(sun);
const camera = new THREE.PerspectiveCamera(L.fov, innerWidth / innerHeight, 0.01, 20);

// The palette faces you (+Z toward the viewer); the cube inside it turns.
const palette = new THREE.Group();
scene.add(palette);

// Every point its own color: a fragment's color is just where it is in the cube.
const cubeMaterial = new THREE.ShaderMaterial({
  uniforms: { uSize: { value: L.size } },
  vertexShader: `uniform float uSize; varying vec3 vColor; void main() { vColor = position / uSize + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vColor; void main() { gl_FragColor = vec4(clamp(vColor, 0.0, 1.0), 1.0); }`
});
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMaterial);
palette.add(cube);
const edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true }));
cube.add(edges);
const ring = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }));
cube.add(ring);

// ---- The cube's turn ---------------------------------------------------------------------------------------------
// It stands with an edge toward you, tipped back so its top shows too. The ring's face turns to the right-hand side
// face, the one nearest the hand that picks.
let DISPLAY, SLOT;
let picked = new ColorCube(START, 0, true);
const ringNormal = () => { const n = v3(0, 0, 0); n.setComponent(picked.axis, picked.high ? 1 : -1); return n; };
let rollFrom = new THREE.Quaternion(), rollTo = new THREE.Quaternion(), roll = 1;

/** Stands the cube as `tilt` and `yaw` say, the ring's face in its slot. */
function standCube() {
  DISPLAY = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -deg(L.tilt)).multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), deg(L.yaw)));
  SLOT = v3(1, 0, 0).applyQuaternion(DISPLAY);
  rollTo = fromTo(ringNormal().applyQuaternion(DISPLAY), SLOT).multiply(DISPLAY);
  cube.quaternion.copy(rollTo);
  roll = 1;
}

/** The ring went onto another face: from where it is now, the cube turns the ring's face into its slot, and only that. */
function turnTo() {
  rollFrom.copy(cube.quaternion);
  rollTo = fromTo(ringNormal().applyQuaternion(rollTo), SLOT).multiply(rollTo);
  roll = 0;
}

function showRing() {
  const n = ringNormal();
  // On the tiles, the ring rides on top of them where it is across them, and shows its tile's color.
  const at = grid ? grid.p : picked.color, color = grid ? grid.color : picked.color;
  const lift = shown ? smooth(shatter) * L.tileLift * L.size : 0;
  ring.position.fromArray(at).subScalar(0.5).multiplyScalar(L.size).addScaledVector(n, L.ringLift + lift);
  ring.quaternion.copy(fromTo(v3(0, 0, 1), n));
  const hex = '#' + new THREE.Color().setRGB(...color, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
  swatch.style.background = hex;
  swatchHex.textContent = hex.toUpperCase();
}

// ---- The face breaking off into tiles ----------------------------------------------------------------------------
// The cube is gridN blocks each way. Held still, the layer under the ring stays where it is and the rest of the cube
// falls away from behind it; then that layer parts into blocks, which take on the colors around the ring's.
// Going back, they close up into the face again and the rest of the cube grows back behind them.
let grid = null;    // the tiles the ring is on, or null on the whole face
let shown = null;   // the tiles showing, still while they go back into the face
let shatter = 0, shatterTo = 0; // 0 the whole face, 1 parted into tiles
const smooth = (t) => t * t * (3 - 2 * t);
let tileWobble = [];  // each tile's own delay and the way it tips as it parts

// Blocks paint themselves like the big cube: each carries the colors of where it came from (`home`, the color at its
// middle, and `span` across it), so at first it looks just like that bit of the cube. `mix` fades that into a solid
// color, and `shade` darkens its sides so it reads as a block of its own. Colors go out as they are, as the cube's do.
const BLOCK_ATTRIBUTES = [['aHome', 3], ['aSolid', 3], ['aSpan', 1], ['aMix', 1], ['aShade', 1]];
function blockMesh(count) {
  const geometry = roundBox(1);
  for (const [name, size] of BLOCK_ATTRIBUTES) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { uPaint: { value: new THREE.Matrix3() } }, // the block's own way round, in the cube
    vertexShader: `
      attribute vec3 aHome; attribute vec3 aSolid; attribute float aSpan; attribute float aMix; attribute float aShade;
      uniform mat3 uPaint; varying vec3 vColor;
      void main() {
        vec3 paint = aHome + uPaint * position * aSpan;
        float side = normal.z > 0.5 ? 1.0 : (normal.z < -0.5 ? 0.45 : 0.7);
        vColor = clamp(mix(paint, aSolid, aMix), 0.0, 1.0) * clamp(mix(1.0, side, aShade), 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
function paintBlock(mesh, k, n, { home, solid = home, span = 1 / n, mix = 0, shade = mix }) {
  const a = mesh.geometry.attributes;
  a.aHome.setXYZ(k, ...home); a.aSolid.setXYZ(k, ...solid); a.aSpan.setX(k, span); a.aMix.setX(k, mix); a.aShade.setX(k, shade * L.tileShade);
}
/** Rounds a block mesh's blocks anew, keeping each block's paint. */
function reshapeBlocks(mesh) {
  const old = mesh.geometry, geometry = roundBox(1);
  for (const [name] of BLOCK_ATTRIBUTES) geometry.setAttribute(name, old.attributes[name]);
  mesh.geometry = geometry;
  old.dispose();
}
function blocksChanged(mesh) {
  for (const [name] of BLOCK_ATTRIBUTES) mesh.geometry.attributes[name].needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
}

/** Block c (three indices, 0 to n - 1): its middle as a color, and as a place in the cube. */
const cellColor = (c, n) => c.map((k) => (k + 0.5) / n);
const cellPlace = (c, n) => v3(...cellColor(c, n)).subScalar(0.5).multiplyScalar(L.size);
/** Every block but those in the layer under the ring. */
function behind(axis, high, n) {
  const out = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    const c = [x, y, z];
    if (c[axis] !== (high ? n - 1 : 0)) out.push(c);
  }
  return out;
}

const tiles = blockMesh(GRID_MAX ** 2);
cube.add(tiles);
const body = blockMesh(GRID_MAX ** 3);  // the rest of the cube, growing back behind the face
cube.add(body);

// ---- What falls away ---------------------------------------------------------------------------------------------
// In the palette, not the cube, so it falls straight down whichever way the cube is turned.
const CRUMBS = GRID_MAX ** 3, CRUMB_WAIT = 0.08; // s
const crumbs = blockMesh(CRUMBS);
crumbs.count = 0;
crumbs.visible = true;
palette.add(crumbs);
const bits = [];

/** Block c of the cube comes away, backward from the face that stays (`away`, in the palette), and falls. */
function fallAway(c, n, away) {
  if (bits.length >= CRUMBS) bits.shift();
  bits.push({
    c, n, home: cellColor(c, n),
    pos: cellPlace(c, n).applyQuaternion(cube.quaternion).add(cube.position),
    vel: away.clone().multiplyScalar(L.crumbPush * (0.5 + Math.random())).add(v3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(L.crumbPush * 0.5)),
    turn: cube.quaternion.clone(),
    spin: new THREE.Quaternion().setFromAxisAngle(v3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), 0.5 + Math.random()),
    wait: Math.random() * CRUMB_WAIT, age: 0, life: L.crumbLife * (0.8 + Math.random() * 0.4)
  });
}

const crumbMatrix = new THREE.Matrix4(), crumbScale = new THREE.Vector3(), crumbStep = new THREE.Quaternion(), still = new THREE.Quaternion();
function updateCrumbs(dt) {
  for (let k = bits.length - 1; k >= 0; k--) {
    const b = bits[k];
    if (b.wait > 0) { b.wait -= dt; continue; }
    b.age += dt;
    if (b.age >= b.life) { bits.splice(k, 1); continue; }
    b.vel.y -= L.crumbFall * dt;
    b.pos.addScaledVector(b.vel, dt);
    crumbStep.slerpQuaternions(still, b.spin, dt);
    b.turn.premultiply(crumbStep);
  }
  bits.forEach((b, k) => {
    const life = b.age / b.life, left = 1 - smooth(Math.min(1, Math.max(0, (life - 0.5) / 0.5)));
    crumbs.setMatrixAt(k, crumbMatrix.compose(b.pos, b.turn, crumbScale.setScalar((L.size / b.n) * left)));
    paintBlock(crumbs, k, b.n, { home: b.home, shade: Math.min(1, life * 3) * 0.8 });
  });
  crumbs.count = bits.length;
  blocksChanged(crumbs);
}

/** Held still: the rest of the cube falls away behind the ring's face, and the face parts into tiles. */
function openGrid() {
  const n = L.gridN;
  grid = shown = new FaceGrid(picked.color, picked.axis, picked.high, n, L.gridSpan);
  tileWobble = Array.from({ length: n * n }, () => ({
    delay: Math.random() * F.tileStagger,
    tip: v3(Math.random() - 0.5, Math.random() - 0.5, 0).normalize(),
    angle: (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.1)
  }));
  const away = v3(0, 0, 0);
  away.setComponent(grid.axis, grid.high ? -1 : 1);
  away.applyQuaternion(cube.quaternion);
  for (const c of behind(grid.axis, grid.high, n)) fallAway(c, n, away);
  body.visible = false;
  cubeMaterial.visible = false;
  edges.visible = false;
  tiles.visible = true;
  tiles.count = n * n;
  shatterTo = 1;
  updateTiles(0);
}

/** Off the tiles, or let go: the tiles close up into the face, the cube grows back, and the ring is on this color. */
function closeGrid(color) {
  picked = new ColorCube(color, grid.axis, grid.high);
  grid = null;
  shatterTo = 0;
  body.visible = true;
  stillFor = 0;
  anchor = picked.color;
  showRing();
}
const commitGrid = () => closeGrid(grid.color);
const exitGrid = () => closeGrid(grid.actual());

const tileMatrix = new THREE.Matrix4(), tilePos = new THREE.Vector3(), tileScale = new THREE.Vector3(), tileTurn = new THREE.Quaternion(), tileTip = new THREE.Quaternion();
function updateTiles(dt) {
  if (!shown) return;
  shatter = shatterTo > shatter ? Math.min(1, shatter + dt / F.shatter) : Math.max(0, shatter - dt / F.shatter);
  if (shatter === 0 && shatterTo === 0) { // back together: the big cube again
    tiles.visible = body.visible = false;
    cubeMaterial.visible = true;
    edges.visible = L.edgeOpacity > 0;
    shown = null;
    showRing();
    return;
  }
  const N = shown.n, cell = L.size / N, normal = v3(0, 0, 0), layer = shown.high ? N - 1 : 0;
  normal.setComponent(shown.axis, shown.high ? 1 : -1);
  const turn = fromTo(v3(0, 0, 1), normal), [i, j] = shown.free;
  tiles.material.uniforms.uPaint.value.setFromMatrix4(tileMatrix.makeRotationFromQuaternion(turn));
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const k = a * N + b, w = tileWobble[k], c = [0, 0, 0];
    c[shown.axis] = layer; c[i] = a; c[j] = b;
    // Each in its own time: from its place in the face, it parts from the others, lifts, and takes its own color.
    const t = Math.min(1, Math.max(0, (shatter - w.delay) / (1 - F.tileStagger))), e = smooth(t);
    const size = cell * (1 - L.tileGap * e);
    tilePos.copy(cellPlace(c, N)).addScaledVector(normal, cell / 2 - size / 2 + L.tileLift * L.size * e);
    tileTip.setFromAxisAngle(w.tip, w.angle * L.tileTip * Math.sin(Math.PI * t));
    tileTurn.copy(turn).multiply(tileTip);
    tiles.setMatrixAt(k, tileMatrix.compose(tilePos, tileTurn, tileScale.setScalar(size)));
    paintBlock(tiles, k, N, { home: cellColor(c, N), solid: shown.colorAt(a, b), mix: e });
  }
  blocksChanged(tiles);
  // Going back, the rest of the cube grows in behind the face as the tiles close up.
  if (body.visible) {
    const grow = 1 - smooth(shatter);
    behind(shown.axis, shown.high, N).forEach((c, k) => {
      body.setMatrixAt(k, tileMatrix.compose(cellPlace(c, N), still, tileScale.setScalar(cell * Math.max(0.001, grow))));
      paintBlock(body, k, N, { home: cellColor(c, N) });
    });
    body.count = N ** 3 - N * N;
    blocksChanged(body);
  }
  showRing();
}

// Still for long enough while picking, it breaks up.
let stillFor = 0, anchor = null;
function updateLinger(dt, active) {
  if (!active || grid || roll < 1) { stillFor = 0; anchor = null; return; }
  if (!anchor || Math.hypot(...picked.color.map((c, i) => c - anchor[i])) > F.lingerStill) { anchor = picked.color; stillFor = 0; return; }
  stillFor += dt;
  if (stillFor >= F.linger) openGrid();
}

/** A point in or on the cube, 0 to 1 each way: the ring goes there, on the face it's nearest. */
function pickAt(p) {
  if (grid) {
    const face = faceAt(p, grid, F.faceStick);
    if (face.axis === grid.axis && face.high === grid.high) { grid.set(p); showRing(); return; }
    exitGrid(); // onto another face: the tiles go back, and it picks there as ever
  }
  const { axis, high } = faceAt(p, picked, F.faceStick);
  const turned = axis !== picked.axis || high !== picked.high;
  picked = new ColorCube(p.map(clamp01), axis, high);
  if (turned) turnTo();
  showRing();
}

/** A world point as 0 to 1 each way across the cube. */
function cubePoint(world) {
  const local = cube.worldToLocal(world.clone());
  return [local.x, local.y, local.z].map((c) => c / L.size + 0.5);
}

/** How far a world point is outside the cube (0 inside). */
function boxDistance(world) {
  const local = cube.worldToLocal(world.clone()), h = L.size / 2;
  return Math.hypot(...[local.x, local.y, local.z].map((c) => Math.max(0, Math.abs(c) - h)));
}

const raycaster = new THREE.Raycaster();
/** A ray's hit on the cube, as a world point, or null. */
function hit(origin, direction) {
  raycaster.set(origin, direction);
  const h = raycaster.intersectObject(cube, false)[0];
  return h ? h.point : null;
}

// ---- Hands and controllers ---------------------------------------------------------------------------------------
const handModels = new XRHandModelFactory();
const sources = { left: null, right: null }; // { hand, controller, grip, source }
for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i), hand = renderer.xr.getHand(i);
  scene.add(controller, grip, hand);
  const model = handModels.createHandModel(hand, 'mesh');
  hand.add(model);
  const rayLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(0, 0, 0), v3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  rayLine.visible = false;
  controller.add(rayLine);
  const entry = { controller, grip, hand, model, rayLine, source: null, selecting: false };
  controller.addEventListener('connected', (e) => { entry.source = e.data; sources[e.data.handedness] = entry; });
  controller.addEventListener('disconnected', () => { if (sources.left === entry) sources.left = null; if (sources.right === entry) sources.right = null; entry.source = null; });
  controller.addEventListener('selectstart', () => { entry.selecting = true; });
  controller.addEventListener('selectend', () => { entry.selecting = false; });
}

const joint = (entry, name) => { const j = entry.hand.joints[name]; return j && j.visible !== false ? j.getWorldPosition(new THREE.Vector3()) : null; };

/** Where the cube rests on the left hand, or null: on the palm (between wrist and middle knuckle), or on the top of
 * the left controller (along its handle from the grip, toward the thumb, which is the grip space's -Z). */
function leftRest() {
  const e = sources.left;
  if (!e || !e.source) return null;
  if (e.source.hand) {
    const wrist = joint(e, 'wrist'), knuckle = joint(e, 'middle-finger-phalanx-proximal');
    const index = joint(e, 'index-finger-phalanx-proximal'), pinky = joint(e, 'pinky-finger-phalanx-proximal');
    if (!wrist || !knuckle || !index || !pinky) return null;
    // Out of the palm, for the left hand: (pinky - wrist) x (index - wrist). Palm up, index on the left, that's up.
    const out = pinky.clone().sub(wrist).cross(index.clone().sub(wrist)).normalize();
    return { at: wrist.lerp(knuckle, 0.5), gap: F.abovePalm, up: out };
  }
  // A hand the browser gives only as a pointer (no joints: hand tracking wasn't granted) has no grip: its ray starts at it.
  if (!e.grip.visible) return e.controller.visible ? { at: e.controller.getWorldPosition(new THREE.Vector3()), gap: F.abovePalm } : null;
  const top = v3(0, 0, -F.controllerTop).applyQuaternion(e.grip.getWorldQuaternion(new THREE.Quaternion()));
  return { at: e.grip.getWorldPosition(new THREE.Vector3()).add(top), gap: F.aboveController };
}

/** Half the cube's height as it stands, so its lowest corner can rest on the hand. */
function halfHeight() {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(rollTo).elements; // column-major: row y is 1, 5, 9
  return (L.size / 2) * (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]));
}

// The right hand's pinch, sliding the ring.
let pinching = false, holding = false, touching = false, aiming = false;
const last = new THREE.Vector3(), eased = new THREE.Vector3();

function updateRight(dt) {
  touching = aiming = false;
  const e = sources.right;
  if (!e || !e.source) { holding = pinching = false; return; }
  e.rayLine.visible = !e.source.hand;

  if (e.source.hand) {
    const thumb = joint(e, 'thumb-tip'), index = joint(e, 'index-finger-tip');
    if (!thumb || !index) { holding = pinching = false; return; }
    // A pinch is the headset's own (it sends select for a hand's pinch) or thumb and index tips close enough.
    const gap = thumb.distanceTo(index), point = thumb.clone().lerp(index, 0.5);
    const closed = e.selecting || gap < F.pinchOn;
    const fresh = !pinching && closed;
    pinching = pinching ? e.selecting || gap < F.pinchOff : closed;
    if (fresh && boxDistance(point) <= F.reach) { holding = true; last.copy(point); eased.copy(point); }
    if (holding && !pinching) holding = false;
    if (holding) {
      eased.lerp(point, 1 - Math.exp(-dt / F.ringEase));
      // Against where the cube is turning to, so the ring's way doesn't swing while it rolls.
      const turn = palette.getWorldQuaternion(new THREE.Quaternion()).multiply(rollTo).invert();
      const move = eased.clone().sub(last).applyQuaternion(turn).multiplyScalar(F.drag / L.size);
      last.copy(eased);
      if (grid) { if (!grid.move([move.x, move.y, move.z])) exitGrid(); }
      else if (picked.move(move.x, move.y, move.z)) turnTo();
      showRing();
    } else if (!pinching && boxDistance(index) <= F.touch) {
      touching = true;
      if (grid) { pickAt(cubePoint(index).map(clamp01)); return; }
      // A fingertip on the cube: the ring eases toward where it touches on its face, and goes straight to another face.
      const to = cubePoint(index).map(clamp01), from = picked.color;
      const onFace = Math.abs(to[picked.axis] - (picked.high ? 1 : 0)) <= F.faceStick;
      const k = 1 - Math.exp(-dt / F.ringEase);
      pickAt(onFace ? from.map((c, i) => c + (to[i] - c) * k) : to);
    }
    return;
  }

  // A controller (or a hand without joints, as a pointer): the ray, and the trigger or pinch picks where it lands.
  if (!e.controller.visible) { aiming = false; return; }
  const origin = e.controller.getWorldPosition(new THREE.Vector3());
  const direction = v3(0, 0, -1).applyQuaternion(e.controller.getWorldQuaternion(new THREE.Quaternion()));
  const at = hit(origin, direction);
  e.rayLine.scale.z = at ? origin.distanceTo(at) : 0.5;
  aiming = !!at && e.selecting;
  if (aiming) pickAt(cubePoint(at));
  else if (grid && e.selecting) exitGrid(); // pointed off the cube
}

// ---- Where the palette goes --------------------------------------------------------------------------------------
const head = new THREE.Vector3();
function placePalette(dt, inXR) {
  if (!inXR) { palette.position.set(0, 0, 0); palette.quaternion.identity(); return; }
  const xrCamera = renderer.xr.getCamera();
  xrCamera.getWorldPosition(head);
  const rest = leftRest();
  let at = null;
  if (rest) at = rest.at.addScaledVector(rest.up || v3(0, 1, 0), halfHeight() + rest.gap); // its lowest corner that far off the palm or controller
  else { // No left hand: it waits in front of you.
    const forward = v3(0, 0, -1).applyQuaternion(xrCamera.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    at = head.clone().addScaledVector(forward, 0.4).add(v3(0, -0.15, 0));
  }
  const toward = head.clone().sub(at).setY(0);
  const turn = toward.lengthSq() > 1e-6 ? new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), Math.atan2(toward.x, toward.z)) : palette.quaternion.clone();
  const k = placed ? 1 - Math.exp(-dt / F.paletteEase) : 1;
  palette.position.lerp(at, k);
  palette.quaternion.slerp(turn, k);
  placed = true;
}
let placed = false;

// ---- Mouse (no headset) -------------------------------------------------------------------------------------------
let mouseDown = false;
const pointer = new THREE.Vector2();
function mousePick(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const h = raycaster.intersectObject(cube, false)[0];
  if (h) pickAt(cubePoint(h.point));
  else if (grid) exitGrid(); // dragged off the cube
  return !!h;
}
renderer.domElement.addEventListener('pointerdown', (e) => { if (mousePick(e)) { mouseDown = true; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (mouseDown) mousePick(e);
  else { pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); raycaster.setFromCamera(pointer, camera); renderer.domElement.style.cursor = raycaster.intersectObject(cube, false).length ? 'crosshair' : ''; }
});
renderer.domElement.addEventListener('pointerup', () => { mouseDown = false; });

// ---- Applying the settings -----------------------------------------------------------------------------------------
// Most settings are read where they're used, every frame. These need the scene rebuilt, and only when they change.
const swatch = document.querySelector('.swatch'), swatchHex = document.querySelector('.swatch__hex');
let built = {};
const changed = (...keys) => keys.some((k) => built[k] !== L[k]);
let holdOpen = false; // the tuner's "Hold tiles open": let go, the tiles stay
function applyLook() {
  const remake = (grid || shown) && changed('size', 'gridN', 'gridSpan');
  if (remake) { // the tiles are made for the old settings: put the face back together at once
    if (grid) commitGrid();
    shatter = 0; updateTiles(0);
  }
  if (changed('size', 'roundness')) {
    cube.geometry.dispose();
    cube.geometry = roundBox(L.size);
    cubeMaterial.uniforms.uSize.value = L.size;
  }
  if (changed('size', 'edgeOpacity')) {
    edges.geometry.dispose();
    edges.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(L.size * 1.002, L.size * 1.002, L.size * 1.002));
  }
  edges.material.color.set(L.edgeColor);
  edges.material.opacity = L.edgeOpacity;
  edges.visible = L.edgeOpacity > 0 && !shown;
  if (changed('ringRadius', 'ringWidth')) {
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(Math.max(0, L.ringRadius - L.ringWidth / 2), L.ringRadius + L.ringWidth / 2, 48);
  }
  ring.material.color.set(L.ringColor);
  ring.material.opacity = L.ringOpacity;
  if (changed('roundness')) for (const m of [tiles, body, crumbs]) reshapeBlocks(m);
  if (changed('tilt', 'yaw')) standCube();
  camera.fov = L.fov;
  camera.position.set(0, L.height, L.distance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  document.documentElement.style.setProperty('--bg-inner', L.bgInner);
  document.documentElement.style.setProperty('--bg', L.bgOuter);
  built = { ...L };
  if (remake && holdOpen) openGrid();
  showRing();
}
function holdTiles(on) {
  holdOpen = on;
  if (on && !grid) openGrid();
  if (!on && grid && !mouseDown) commitGrid();
}

// ?tune opens the customizer: it edits LOOK and FEEL in place and calls applyLook.
const DEFAULTS = { LOOK: { ...LOOK }, FEEL: { ...FEEL } };
if (new URLSearchParams(location.search).has('tune')) {
  import('./tune.js').then(({ openTuner }) => openTuner({ sets: { LOOK: [LOOK, DEFAULTS.LOOK], FEEL: [FEEL, DEFAULTS.FEEL] }, apply: applyLook, holdTiles }));
}
applyLook();

// ---- Session, loop -------------------------------------------------------------------------------------------------
const button = XRButton.createButton(renderer, { optionalFeatures: ['hand-tracking', 'local-floor'] });
document.querySelector('.xr').append(button);

renderer.xr.addEventListener('sessionstart', () => {
  placed = false;
  document.body.classList.add('in-xr');
  const session = renderer.xr.getSession();
  if (!(session.enabledFeatures || []).includes('hand-tracking')) console.warn('Hand tracking was not granted: hands work only as pointers.');
});
renderer.xr.addEventListener('sessionend', () => document.body.classList.remove('in-xr'));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Idle, the cube floats slowly up and down; picking, it settles still under your fingers.
let floatTime = 0, floating = 1;
function levitate(dt, active) {
  floating += ((active || grid ? 0 : 1) - floating) * (1 - Math.exp(-dt / 0.3));
  floatTime += dt;
  cube.position.y = Math.sin((floatTime / L.floatPeriod) * Math.PI * 2) * L.floatHeight * floating;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), inXR = renderer.xr.isPresenting;
  placePalette(dt, inXR);
  if (inXR) updateRight(dt);
  else holding = touching = aiming = false;
  const active = mouseDown || holding || touching || aiming;
  if (grid && !active && !holdOpen) commitGrid(); // let go on a tile: that's the color
  updateLinger(dt, active);
  levitate(dt, active);
  updateTiles(dt);
  updateCrumbs(dt);
  if (roll < 1) {
    roll = Math.min(1, roll + dt / F.roll);
    const s = roll * roll * (3 - 2 * roll);
    cube.quaternion.slerpQuaternions(rollFrom, rollTo, s);
  }
  renderer.render(scene, camera);
});
