// The color cube rides above the left hand (palm, or a controller's grip), turned to face you. The right hand picks:
// pinch on the cube and slide the ring, over an edge onto the next face, and the cube rolls to bring that face round;
// or touch it with a fingertip, or point a controller and hold the trigger. Without a headset, the mouse does it.
import * as THREE from 'three';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { ColorCube, faceAt, clamp01 } from './cube.js';

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
  ring.position.fromArray(picked.color).subScalar(0.5).multiplyScalar(CUBE).addScaledVector(n, RING_LIFT);
  ring.quaternion.copy(fromTo(v3(0, 0, 1), n));
  const hex = '#' + new THREE.Color().setRGB(...picked.color, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
  swatch.style.background = hex;
  swatchHex.textContent = hex.toUpperCase();
}

/** A point in or on the cube, 0 to 1 each way: the ring goes there, on the face it's nearest. */
function pickAt(p) {
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
let pinching = false, holding = false;
const last = new THREE.Vector3(), eased = new THREE.Vector3();

function updateRight(dt) {
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
      if (picked.move(move.x, move.y, move.z)) turnTo();
      showRing();
    } else if (!pinching && boxDistance(index) <= TOUCH) {
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
  if (at && e.selecting) pickAt(cubePoint(at));
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
  if (roll < 1) {
    roll = Math.min(1, roll + dt / ROLL);
    const s = roll * roll * (3 - 2 * roll);
    cube.quaternion.slerpQuaternions(rollFrom, rollTo, s);
  }
  renderer.render(scene, camera);
});
