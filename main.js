// The color cube rides above the left hand (palm, or a controller's grip), turned to face you. The right hand picks:
// pinch on the cube and slide the ring, over an edge onto the next face, and the cube rolls to bring that face round;
// or touch it with a fingertip, or point a controller and hold the trigger. Without a headset, the mouse does it.
import * as THREE from 'three';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { ColorCube, faceAt, clamp01 } from './cube.js';
import { FaceGrid } from './grid.js';

// Sizes in meters, times in seconds: the feel of the Unity version.
const CUBE = 0.04;           // the cube's edge
const ABOVE_PALM = 0.07;     // how far above the left palm it rides
const PALETTE_EASE = 0.12;   // it eases after the hand, so tracking doesn't shake it
const REACH = 0.03;          // a pinch this close to the cube takes the ring
const TOUCH = 0.008;         // a fingertip this close to the cube picks where it touches
const DRAG = 0.3;            // of the hand's movement, the ring's: a calm hand for a fine color
const RING_EASE = 0.1;       // the ring and the hand moving it ease after where they're going, like friction
const ROLL = 0.9;            // rolling onto the face the ring went over to
const FACE_STICK = 0.12;     // of the cube's size, a touch can stray off the ring's face before it goes to the next
const PINCH_ON = 0.018, PINCH_OFF = 0.035; // thumb to index tip
const RING_RADIUS = 0.0045, RING_WIDTH = 0.0022, RING_LIFT = 0.0008;
const START = [1, 0.2, 0.15]; // on the red face
// Held still on a color this long while picking, the ring's face breaks up into tiles of the colors around it.
const LINGER = 0.1;          // seconds still
const LINGER_STILL = 0.012;  // of the cube's size, the ring can drift and still be still
const GRID_N = 3;            // tiles each way
const GRID_SPAN = 0.45;      // of each color channel, all the tiles together: 0.15 from one tile to the next
const SHATTER = 0.45;        // the face parting into tiles, and closing up again
const TILE_STAGGER = 0.2;    // of that, how far apart they start
const TILE_LIFT = CUBE * 0.08, TILE_GAP = 0.16; // broken up, the tiles are whole cubes, lifted off the face and apart

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fromTo = (a, b) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());

// ---- Scene -------------------------------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 20);
camera.position.set(0, 0.035, 0.16);
camera.lookAt(0, 0, 0);

// The palette faces you (+Z toward the viewer); the cube inside it turns.
const palette = new THREE.Group();
scene.add(palette);

// Every point its own color: a fragment's color is just where it is in the cube.
const cubeMaterial = new THREE.ShaderMaterial({
  vertexShader: `varying vec3 vColor; void main() { vColor = position / ${CUBE.toFixed(4)} + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vColor; void main() { gl_FragColor = vec4(clamp(vColor, 0.0, 1.0), 1.0); }`
});
const cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE, CUBE, CUBE), cubeMaterial);
palette.add(cube);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(RING_RADIUS - RING_WIDTH / 2, RING_RADIUS + RING_WIDTH / 2, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
);
cube.add(ring);

// ---- The cube's turn ---------------------------------------------------------------------------------------------
// It stands with an edge toward you, tipped back so its top shows too. The ring's face turns to the right-hand side
// face, the one nearest the hand that picks.
const DISPLAY = fromTo(v3(0, 0, 1), v3(0, 0.6, 0.8)).multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), -Math.PI / 4));
const SLOT = v3(1, 0, 0).applyQuaternion(DISPLAY);

let picked = new ColorCube(START, 0, true);
const ringNormal = () => { const n = v3(0, 0, 0); n.setComponent(picked.axis, picked.high ? 1 : -1); return n; };
let rollFrom = new THREE.Quaternion(), rollTo = fromTo(ringNormal().applyQuaternion(DISPLAY), SLOT).multiply(DISPLAY), roll = 1;
cube.quaternion.copy(rollTo);

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
  const lift = shown ? smooth(shatter) * TILE_LIFT : 0;
  ring.position.fromArray(at).subScalar(0.5).multiplyScalar(CUBE).addScaledVector(n, RING_LIFT + lift);
  ring.quaternion.copy(fromTo(v3(0, 0, 1), n));
  const hex = '#' + new THREE.Color().setRGB(...color, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
  swatch.style.background = hex;
  swatchHex.textContent = hex.toUpperCase();
}

// ---- The face breaking off into tiles ----------------------------------------------------------------------------
// The cube is three blocks each way. Held still, the layer under the ring stays where it is and the rest of the cube
// falls away from behind it; then that layer parts into nine blocks, which take on the colors around the ring's.
// Going back, they close up into the face again and the rest of the cube grows back behind them.
let grid = null;    // the tiles the ring is on, or null on the whole face
let shown = null;   // the tiles showing, still while they go back into the face
let shatter = 0, shatterTo = 0; // 0 the whole face, 1 parted into tiles
const smooth = (t) => t * t * (3 - 2 * t);
const CELL = CUBE / GRID_N, CELL_SPAN = 1 / GRID_N;
let tileWobble = [];  // each tile's own delay and the way it tips as it parts

// Blocks paint themselves like the big cube: each carries the colors of where it came from (`home`, the color at its
// middle, and `span` across it), so at first it looks just like that bit of the cube. `mix` fades that into a solid
// color, and `shade` darkens its sides so it reads as a block of its own. Colors go out as they are, as the cube's do.
const BLOCK_ATTRIBUTES = [['aHome', 3], ['aSolid', 3], ['aSpan', 1], ['aMix', 1], ['aShade', 1]];
function blockMesh(count) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  for (const [name, size] of BLOCK_ATTRIBUTES) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { uPaint: { value: new THREE.Matrix3() } }, // the block's own way round, in the cube
    vertexShader: `
      attribute vec3 aHome; attribute vec3 aSolid; attribute float aSpan; attribute float aMix; attribute float aShade;
      uniform mat3 uPaint; varying vec3 vColor;
      void main() {
        vec3 paint = aHome + uPaint * position * aSpan;
        float side = normal.z > 0.5 ? 1.0 : (normal.z < -0.5 ? 0.45 : 0.7);
        vColor = clamp(mix(paint, aSolid, aMix), 0.0, 1.0) * mix(1.0, side, aShade);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
function paintBlock(mesh, k, { home, solid = home, span = CELL_SPAN, mix = 0, shade = mix }) {
  const a = mesh.geometry.attributes;
  a.aHome.setXYZ(k, ...home); a.aSolid.setXYZ(k, ...solid); a.aSpan.setX(k, span); a.aMix.setX(k, mix); a.aShade.setX(k, shade);
}
function blocksChanged(mesh) {
  for (const [name] of BLOCK_ATTRIBUTES) mesh.geometry.attributes[name].needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
}

/** Block c (three indices, 0 to GRID_N - 1): its middle as a color, and as a place in the cube. */
const cellColor = (c) => c.map((k) => (k + 0.5) / GRID_N);
const cellPlace = (c) => v3(...cellColor(c)).subScalar(0.5).multiplyScalar(CUBE);
/** Every block but those in the layer under the ring. */
function behind(axis, high) {
  const out = [];
  for (let x = 0; x < GRID_N; x++) for (let y = 0; y < GRID_N; y++) for (let z = 0; z < GRID_N; z++) {
    const c = [x, y, z];
    if (c[axis] !== (high ? GRID_N - 1 : 0)) out.push(c);
  }
  return out;
}

const tiles = blockMesh(GRID_N * GRID_N);
cube.add(tiles);
const body = blockMesh(GRID_N ** 3);  // the rest of the cube, growing back behind the face
cube.add(body);

// ---- What falls away ---------------------------------------------------------------------------------------------
// In the palette, not the cube, so it falls straight down whichever way the cube is turned.
const CRUMBS = 64, CRUMB_LIFE = 0.7, CRUMB_FALL = 0.5, CRUMB_PUSH = 0.02, CRUMB_WAIT = 0.08; // s, m/s², m/s, s
const crumbs = blockMesh(CRUMBS);
crumbs.count = 0;
crumbs.visible = true;
palette.add(crumbs);
const bits = [];

/** Block c of the cube comes away, backward from the face that stays (`away`, in the palette), and falls. */
function fallAway(c, away) {
  if (bits.length >= CRUMBS) bits.shift();
  bits.push({
    c, home: cellColor(c),
    pos: cellPlace(c).applyQuaternion(cube.quaternion),
    vel: away.clone().multiplyScalar(CRUMB_PUSH * (0.5 + Math.random())).add(v3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(CRUMB_PUSH * 0.5)),
    turn: cube.quaternion.clone(),
    spin: new THREE.Quaternion().setFromAxisAngle(v3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), 0.5 + Math.random()),
    wait: Math.random() * CRUMB_WAIT, age: 0, life: CRUMB_LIFE * (0.8 + Math.random() * 0.4)
  });
}

const crumbMatrix = new THREE.Matrix4(), crumbScale = new THREE.Vector3(), crumbStep = new THREE.Quaternion(), still = new THREE.Quaternion();
function updateCrumbs(dt) {
  for (let k = bits.length - 1; k >= 0; k--) {
    const b = bits[k];
    if (b.wait > 0) { b.wait -= dt; continue; }
    b.age += dt;
    if (b.age >= b.life) { bits.splice(k, 1); continue; }
    b.vel.y -= CRUMB_FALL * dt;
    b.pos.addScaledVector(b.vel, dt);
    crumbStep.slerpQuaternions(still, b.spin, dt);
    b.turn.premultiply(crumbStep);
  }
  bits.forEach((b, k) => {
    const life = b.age / b.life, left = 1 - smooth(Math.min(1, Math.max(0, (life - 0.5) / 0.5)));
    crumbs.setMatrixAt(k, crumbMatrix.compose(b.pos, b.turn, crumbScale.setScalar(CELL * left)));
    paintBlock(crumbs, k, { home: b.home, shade: Math.min(1, life * 3) * 0.8 });
  });
  crumbs.count = bits.length;
  blocksChanged(crumbs);
}

/** Held still: the rest of the cube falls away behind the ring's face, and the face parts into tiles. */
function openGrid() {
  grid = shown = new FaceGrid(picked.color, picked.axis, picked.high, GRID_N, GRID_SPAN);
  tileWobble = Array.from({ length: GRID_N * GRID_N }, () => ({
    delay: Math.random() * TILE_STAGGER,
    tip: v3(Math.random() - 0.5, Math.random() - 0.5, 0).normalize(),
    angle: (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.1)
  }));
  const away = v3(0, 0, 0);
  away.setComponent(grid.axis, grid.high ? -1 : 1);
  away.applyQuaternion(cube.quaternion);
  for (const c of behind(grid.axis, grid.high)) fallAway(c, away);
  body.visible = false;
  cubeMaterial.visible = false;
  tiles.visible = true;
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
  shatter = shatterTo > shatter ? Math.min(1, shatter + dt / SHATTER) : Math.max(0, shatter - dt / SHATTER);
  if (shatter === 0 && shatterTo === 0) { // back together: the big cube again
    tiles.visible = body.visible = false;
    cubeMaterial.visible = true;
    shown = null;
    showRing();
    return;
  }
  const n = v3(0, 0, 0), layer = shown.high ? GRID_N - 1 : 0;
  n.setComponent(shown.axis, shown.high ? 1 : -1);
  const turn = fromTo(v3(0, 0, 1), n), [i, j] = shown.free;
  tiles.material.uniforms.uPaint.value.setFromMatrix4(tileMatrix.makeRotationFromQuaternion(turn));
  for (let a = 0; a < GRID_N; a++) for (let b = 0; b < GRID_N; b++) {
    const k = a * GRID_N + b, w = tileWobble[k], c = [0, 0, 0];
    c[shown.axis] = layer; c[i] = a; c[j] = b;
    // Each in its own time: from its place in the face, it parts from the others, lifts, and takes its own color.
    const t = Math.min(1, Math.max(0, (shatter - w.delay) / (1 - TILE_STAGGER))), e = smooth(t);
    const size = CELL * (1 - TILE_GAP * e);
    tilePos.copy(cellPlace(c)).addScaledVector(n, CELL / 2 - size / 2 + TILE_LIFT * e);
    tileTip.setFromAxisAngle(w.tip, w.angle * Math.sin(Math.PI * t));
    tileTurn.copy(turn).multiply(tileTip);
    tiles.setMatrixAt(k, tileMatrix.compose(tilePos, tileTurn, tileScale.setScalar(size)));
    paintBlock(tiles, k, { home: cellColor(c), solid: shown.colorAt(a, b), mix: e });
  }
  blocksChanged(tiles);
  // Going back, the rest of the cube grows in behind the face as the tiles close up.
  if (body.visible) {
    const grow = 1 - smooth(shatter);
    behind(shown.axis, shown.high).forEach((c, k) => {
      body.setMatrixAt(k, tileMatrix.compose(cellPlace(c), still, tileScale.setScalar(CELL * Math.max(0.001, grow))));
      paintBlock(body, k, { home: cellColor(c) });
    });
    body.count = GRID_N ** 3 - GRID_N * GRID_N;
    blocksChanged(body);
  }
  showRing();
}

// Still for long enough while picking, it breaks up.
let stillFor = 0, anchor = null;
function updateLinger(dt, active) {
  if (!active || grid || roll < 1) { stillFor = 0; anchor = null; return; }
  if (!anchor || Math.hypot(...picked.color.map((c, i) => c - anchor[i])) > LINGER_STILL) { anchor = picked.color; stillFor = 0; return; }
  stillFor += dt;
  if (stillFor >= LINGER) openGrid();
}

/** A point in or on the cube, 0 to 1 each way: the ring goes there, on the face it's nearest. */
function pickAt(p) {
  if (grid) {
    const face = faceAt(p, grid, FACE_STICK);
    if (face.axis === grid.axis && face.high === grid.high) { grid.set(p); showRing(); return; }
    exitGrid(); // onto another face: the tiles go back, and it picks there as ever
  }
  const { axis, high } = faceAt(p, picked, FACE_STICK);
  const turned = axis !== picked.axis || high !== picked.high;
  picked = new ColorCube(p.map(clamp01), axis, high);
  if (turned) turnTo();
  showRing();
}

/** A world point as 0 to 1 each way across the cube. */
function cubePoint(world) {
  const local = cube.worldToLocal(world.clone());
  return [local.x, local.y, local.z].map((c) => c / CUBE + 0.5);
}

/** How far a world point is outside the cube (0 inside). */
function boxDistance(world) {
  const local = cube.worldToLocal(world.clone()), h = CUBE / 2;
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

/** The left palm (between wrist and middle knuckle) or the left controller's grip, or null. */
function leftPalm() {
  const e = sources.left;
  if (!e || !e.source) return null;
  if (e.source.hand) {
    const wrist = joint(e, 'wrist'), knuckle = joint(e, 'middle-finger-phalanx-proximal');
    return wrist && knuckle ? wrist.lerp(knuckle, 0.5) : null;
  }
  return e.grip.getWorldPosition(new THREE.Vector3());
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
    const gap = thumb.distanceTo(index), point = thumb.clone().lerp(index, 0.5);
    const fresh = !pinching && gap < PINCH_ON;
    pinching = pinching ? gap < PINCH_OFF : gap < PINCH_ON;
    if (fresh && boxDistance(point) <= REACH) { holding = true; last.copy(point); eased.copy(point); }
    if (holding && !pinching) holding = false;
    if (holding) {
      eased.lerp(point, 1 - Math.exp(-dt / RING_EASE));
      // Against where the cube is turning to, so the ring's way doesn't swing while it rolls.
      const turn = palette.getWorldQuaternion(new THREE.Quaternion()).multiply(rollTo).invert();
      const move = eased.clone().sub(last).applyQuaternion(turn).multiplyScalar(DRAG / CUBE);
      last.copy(eased);
      if (grid) { if (!grid.move([move.x, move.y, move.z])) exitGrid(); }
      else if (picked.move(move.x, move.y, move.z)) turnTo();
      showRing();
    } else if (!pinching && boxDistance(index) <= TOUCH) {
      touching = true;
      if (grid) { pickAt(cubePoint(index).map(clamp01)); return; }
      // A fingertip on the cube: the ring eases toward where it touches on its face, and goes straight to another face.
      const to = cubePoint(index).map(clamp01), from = picked.color;
      const onFace = Math.abs(to[picked.axis] - (picked.high ? 1 : 0)) <= FACE_STICK;
      const k = 1 - Math.exp(-dt / RING_EASE);
      pickAt(onFace ? from.map((c, i) => c + (to[i] - c) * k) : to);
    }
    return;
  }

  // A controller: the ray, and the trigger picks where it lands.
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
  let at = leftPalm();
  if (at) at.y += ABOVE_PALM;
  else { // No left hand: it waits in front of you.
    const forward = v3(0, 0, -1).applyQuaternion(xrCamera.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    at = head.clone().addScaledVector(forward, 0.4).add(v3(0, -0.15, 0));
  }
  const toward = head.clone().sub(at).setY(0);
  const turn = toward.lengthSq() > 1e-6 ? new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), Math.atan2(toward.x, toward.z)) : palette.quaternion.clone();
  const k = placed ? 1 - Math.exp(-dt / PALETTE_EASE) : 1;
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

// ---- UI, session, loop ---------------------------------------------------------------------------------------------
const swatch = document.querySelector('.swatch'), swatchHex = document.querySelector('.swatch__hex');
showRing();

const button = XRButton.createButton(renderer, { optionalFeatures: ['hand-tracking', 'local-floor'] });
document.querySelector('.xr').append(button);

renderer.xr.addEventListener('sessionstart', () => {
  placed = false;
  document.body.classList.add('in-xr');
  // In passthrough your own hands are there; in VR, show tracked ones.
  const opaque = renderer.xr.getSession().environmentBlendMode === 'opaque';
  for (const i of [0, 1]) renderer.xr.getHand(i).children.forEach((c) => (c.visible = opaque));
});
renderer.xr.addEventListener('sessionend', () => document.body.classList.remove('in-xr'));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), inXR = renderer.xr.isPresenting;
  placePalette(dt, inXR);
  if (inXR) updateRight(dt);
  else holding = touching = aiming = false;
  const active = mouseDown || holding || touching || aiming;
  if (grid && !active) commitGrid(); // let go on a tile: that's the color
  updateLinger(dt, active);
  updateTiles(dt);
  updateCrumbs(dt);
  if (roll < 1) {
    roll = Math.min(1, roll + dt / ROLL);
    const s = roll * roll * (3 - 2 * roll);
    cube.quaternion.slerpQuaternions(rollFrom, rollTo, s);
  }
  renderer.render(scene, camera);
});
