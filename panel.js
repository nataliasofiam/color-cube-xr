// A sheet of paper in front of you to draw on, in the color the cube has picked: touch it with an index fingertip, or
// point at it (a controller, or a hand's pointer) and hold the trigger or pinch. Round it, a frosted-glass frame shows
// as a hand or controller comes near: pinch it, grip it, or point at it and pull the trigger to carry the paper. One
// hand carries it, turning it to face you; two move, turn and scale it.
import * as THREE from 'three';
import { PANEL as P } from './settings.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);
const CANVAS_W = 2048;

export class Panel {
  constructor(scene) {
    this.root = new THREE.Group();     // where the paper is and which way it faces; never scaled
    this.root.visible = false;
    scene.add(this.root);
    this.scale = 1;                    // of the paper's opening size
    this.opened = false;

    // The paper: a canvas, its grain painted once underneath the ink.
    const w = CANVAS_W, h = Math.round((CANVAS_W * P.height) / P.width);
    this.canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.ctx = this.canvas.getContext('2d');
    this.paintPaper();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.sheet = new THREE.Group();    // scaled with the paper
    this.root.add(this.sheet);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(P.width, P.height), new THREE.MeshBasicMaterial({ map: this.texture }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(P.width, P.height), new THREE.MeshBasicMaterial({ color: 0xe4dfd3, side: THREE.BackSide }));
    back.position.z = -0.0008;
    this.sheet.add(face, back);

    // The frame: frosted glass round the paper, kept at its real size whatever the paper's.
    this.frameMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uInner: { value: new THREE.Vector2() }, uBand: { value: P.band }, uShow: { value: 0 }, uHeld: { value: 0 }, uGlass: { value: P.glass }, uCam: { value: v3() } },
      vertexShader: `varying vec3 vLocal; void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec2 uInner; uniform float uBand, uShow, uHeld, uGlass; uniform vec3 uCam; varying vec3 vLocal;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 a = abs(vLocal.xy);
          float t = clamp(max(a.x - uInner.x, a.y - uInner.y) / uBand, 0.0, 1.0);   // 0 at the paper, 1 at the outer edge
          float cloud = 0.6 * noise(vLocal.xy * 400.0) + 0.4 * noise(vLocal.xy * 120.0 + 7.0);
          float body = uGlass * (1.0 + uHeld * 0.8) * (0.7 + 0.6 * cloud);          // milky, softly clouded
          float glow = pow(t, 3.0) * 0.05;                                         // brighter toward the cut edge
          float line = smoothstep(0.9, 0.96, t) * 0.18;                            // the faint white line round it
          vec3 v = normalize(uCam - vLocal);
          float u = (vLocal.x + vLocal.y) / (uInner.x + uInner.y + 2.0 * uBand);
          float sheen = exp(-pow((u - dot(v.xy, vec2(1.2))) * 4.0, 2.0)) * 0.08;    // drifts across as the head moves
          gl_FragColor = vec4(vec3(0.96, 0.97, 1.0), (body + glow + line + sheen) * uShow);
        }`
    });
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), this.frameMaterial);
    this.frame.visible = false;
    this.root.add(this.frame);
    this.frameScale = 0;
    this.show = 0;
    this.shown = false;

    // A dot where a fingertip or pointer would draw.
    this.cursors = new Map();

    this.inputs = new Map();  // per input: pinch state, last button states, pen
    this.grabs = new Map();   // input -> { kind: 'point' | 'ray', local, dist }
    this.pair = null;         // two hands' starting state
  }

  paintPaper() {
    const { ctx, canvas: { width: w, height: h } } = this;
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, 0, w, h);
    // Grain: specks a shade lighter and darker, and a few faint fibers.
    for (let k = 0; k < 60000; k++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }
    ctx.strokeStyle = 'rgba(120,100,70,0.04)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 400; k++) {
      const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, l = 6 + Math.random() * 18;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  }

  /** Straight ahead of the head, a little below the eyes, leaning back toward them. */
  open(head, headQuat) {
    const forward = v3(0, 0, -1).applyQuaternion(headQuat).setY(0);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    this.root.position.copy(head).addScaledVector(forward, P.distance).add(v3(0, -P.below, 0));
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-forward.x, -forward.z));
    this.root.quaternion.copy(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -THREE.MathUtils.degToRad(P.lean)));
    this.opened = true;
  }

  get halfW() { return (P.width * this.scale) / 2; }
  get halfH() { return (P.height * this.scale) / 2; }

  /** Is this input the panel's just now (carrying it, or drawing)? The cube leaves it alone then. */
  uses(id) { const s = this.inputs.get(id); return this.grabs.has(id) || !!(s && s.pen); }

  toLocal(world) { return this.root.worldToLocal(world.clone()); }

  /** How far a world point is from the frame (0 on it). */
  frameDistance(world) {
    const l = this.toLocal(world), ax = Math.abs(l.x), ay = Math.abs(l.y), hw = this.halfW, hh = this.halfH, B = P.band;
    const across = ax <= hw && ay <= hh ? Math.min(hw - ax, hh - ay) : Math.hypot(Math.max(0, ax - hw - B), Math.max(0, ay - hh - B));
    const depth = l.z > 0 ? l.z : Math.max(0, -l.z - P.thickness);
    return Math.hypot(across, depth);
  }

  /** Where a ray meets the paper's plane: { local, dist, on: 'paper' | 'frame' | null }, or null. */
  rayHit(ray) {
    const inv = this.root.quaternion.clone().invert();
    const o = this.toLocal(ray.origin), d = ray.direction.clone().applyQuaternion(inv);
    if (Math.abs(d.z) < 1e-6) return null;
    const dist = -o.z / d.z;
    if (dist <= 0) return null;
    const local = o.addScaledVector(d, dist), ax = Math.abs(local.x), ay = Math.abs(local.y);
    const on = ax <= this.halfW && ay <= this.halfH ? 'paper' : ax <= this.halfW + P.band && ay <= this.halfH + P.band ? 'frame' : null;
    return { local, dist, on };
  }

  /** A local point on the paper, as canvas pixels. */
  toCanvas(local) {
    return [(local.x / (2 * this.halfW) + 0.5) * this.canvas.width, (0.5 - local.y / (2 * this.halfH)) * this.canvas.height];
  }

  ink(from, to, rgb) {
    const ctx = this.ctx;
    ctx.strokeStyle = `rgb(${rgb.map((c) => Math.round(c * 255)).join(',')})`;
    ctx.lineWidth = (P.ink / (2 * this.halfW)) * this.canvas.width;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke();
    this.texture.needsUpdate = true;
  }

  cursor(id, local, rgb) {
    let c = this.cursors.get(id);
    if (!c) {
      c = new THREE.Mesh(new THREE.RingGeometry(0.0018, 0.003, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }));
      this.root.add(c);
      this.cursors.set(id, c);
    }
    c.visible = !!local;
    if (local) { c.position.set(local.x, local.y, 0.0015); c.material.color.setRGB(...rgb, THREE.SRGBColorSpace); }
  }

  /** The point an input holds the panel by, in the world, now. */
  handlePoint(input, grab) {
    if (grab.kind === 'ray') return input.ray ? input.ray.origin.clone().addScaledVector(input.ray.direction, grab.dist) : null;
    return input.hand ? input.thumb.clone().lerp(input.index, 0.5) : input.grip;
  }

  rebuildFrame() {
    const hw = this.halfW, hh = this.halfH, B = P.band, r = Math.min(P.corner, B);
    const ow = hw + B, oh = hh + B, s = new THREE.Shape();
    s.moveTo(-ow + r, -oh); s.lineTo(ow - r, -oh); s.quadraticCurveTo(ow, -oh, ow, -oh + r);
    s.lineTo(ow, oh - r); s.quadraticCurveTo(ow, oh, ow - r, oh); s.lineTo(-ow + r, oh);
    s.quadraticCurveTo(-ow, oh, -ow, oh - r); s.lineTo(-ow, -oh + r); s.quadraticCurveTo(-ow, -oh, -ow + r, -oh);
    const hole = new THREE.Path();
    hole.moveTo(-hw, -hh); hole.lineTo(-hw, hh); hole.lineTo(hw, hh); hole.lineTo(hw, -hh); hole.lineTo(-hw, -hh);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: P.thickness, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -P.thickness); // its top flush with the paper's face
    this.frame.geometry.dispose();
    this.frame.geometry = g;
    this.frameMaterial.uniforms.uInner.value.set(hw, hh);
    this.frameScale = this.scale;
  }

  /**
   * One frame. `inputs`: [{ id, hand, thumb, index, select, squeeze, grip, ray: { origin, direction } }] (hands with
   * joints have thumb and index; a controller has grip). `busy(id)`: the cube has that input. `rgb`: the ink.
   */
  update(dt, { head, headQuat, inputs, busy, rgb, pinchOn, pinchOff }) {
    this.root.visible = true;
    if (!this.opened) this.open(head, headQuat);
    const seen = new Set();
    let near = Infinity;

    for (const input of inputs) {
      const id = input.id;
      seen.add(id);
      const s = this.inputs.get(id) || { pinching: false, select: false, squeeze: false, pen: null };
      this.inputs.set(id, s);

      // Pinch (hands with joints): the headset's own, or thumb and index tips close.
      const fresh = { pinch: false, select: input.select && !s.select, squeeze: input.squeeze && !s.squeeze };
      if (input.hand) {
        const gap = input.thumb.distanceTo(input.index);
        const was = s.pinching;
        s.pinching = was ? input.select || gap < pinchOff : input.select || gap < pinchOn;
        fresh.pinch = s.pinching && !was;
      }
      s.select = input.select; s.squeeze = input.squeeze;

      const hit = input.ray ? this.rayHit(input.ray) : null;
      // How near the frame: fingertips or the controller, or a pointer on the frame itself.
      for (const p of input.hand ? [input.index, input.thumb] : input.grip ? [input.grip] : []) near = Math.min(near, this.frameDistance(p));
      if (hit && hit.on === 'frame' && !input.hand) near = 0;

      // Taking the frame.
      // (A fingertip reaching for the frame may brush the paper's edge first: the pinch still takes the frame.)
      if (!this.grabs.has(id) && !busy(id) && s.pen !== 'ray') {
        let grab = null;
        // A hand: as the pinch closes (by the tips' distance, or when the headset counts it, fingers together), with
        // the fingers within reach of the frame. The tips' midpoint moves as they close, so the nearer tip counts too.
        const reach = input.hand && Math.min(...[input.thumb, input.index, input.thumb.clone().lerp(input.index, 0.5)].map((q) => this.frameDistance(q)));
        if (input.hand && (fresh.pinch || (fresh.select && s.pinching)) && reach <= P.grabHand) grab = { kind: 'point' };
        else if (!input.hand && input.grip && fresh.squeeze && this.frameDistance(input.grip) <= P.grabGrip) grab = { kind: 'point' };
        // Pointing: a controller's trigger, or a hand's pinch from further off than the frame shows (close up, a hand
        // takes it by the fingers, not its ray).
        else if (hit && hit.on === 'frame' && (input.hand ? fresh.pinch && reach > P.showNear : fresh.select)) grab = { kind: 'ray', dist: hit.dist };
        if (grab) { this.grabs.set(id, grab); s.pen = s.last = null; this.regrip(inputs); }
      }
      // Letting go.
      const g = this.grabs.get(id);
      if (g) {
        const holding = g.kind === 'ray' ? input.select || s.pinching : input.hand ? s.pinching : input.squeeze;
        if (!holding) { this.grabs.delete(id); this.regrip(inputs); }
      }

      // Drawing: a fingertip on the paper, or a pointer on it with the trigger or pinch held.
      let at = null, down = false;
      if (!this.grabs.has(id) && !busy(id)) {
        if (input.hand) {
          const l = this.toLocal(input.index);
          const inside = Math.abs(l.x) <= this.halfW && Math.abs(l.y) <= this.halfH;
          if (inside && l.z < 0.04 && l.z > -0.06) at = l;
          down = inside && (s.pen === 'finger' ? l.z < P.penUp && l.z > -0.06 : l.z < P.penDown && l.z > -0.04);
          if (down) s.mode = 'finger';
        }
        if (!down && hit && hit.on === 'paper' && !(input.hand && at)) {
          at = hit.local;
          const pressed = input.hand ? s.pinching : input.select;
          // Only a press that starts on the paper draws, so a pinch elsewhere doesn't streak across it.
          down = pressed && (s.pen === 'ray' || (input.hand ? fresh.pinch : fresh.select));
          if (down) s.mode = 'ray';
        }
      }
      if (down) {
        const px = this.toCanvas(at);
        this.ink(s.last || px, px, rgb);
        s.last = px;
        s.pen = s.mode;
      } else { s.pen = null; s.last = null; }
      this.cursor(id, at, rgb);
    }
    for (const id of [...this.inputs.keys()]) if (!seen.has(id)) { this.inputs.delete(id); this.cursor(id, null); if (this.grabs.delete(id)) this.regrip(inputs); }

    this.carry(dt, inputs, head);

    // The frame: shown near, hidden far, held always.
    const held = this.grabs.size > 0;
    if (held || near <= P.showNear) this.shown = true;
    else if (near > P.hideFar) this.shown = false;
    this.show = THREE.MathUtils.clamp(this.show + (this.shown ? 1 : -1) * (dt / P.fade), 0, 1);
    const u = this.frameMaterial.uniforms;
    u.uShow.value = this.show;
    u.uHeld.value += ((held ? 1 : 0) - u.uHeld.value) * Math.min(1, dt / P.fade);
    u.uGlass.value = P.glass;
    u.uCam.value.copy(this.toLocal(head));
    this.frame.visible = this.show > 0;
    if (this.frameScale !== this.scale) this.rebuildFrame();
  }

  /** The hands on it changed: each keeps the point it holds, and two hands start from where the panel is now. */
  regrip(inputs) {
    const byId = new Map(inputs.map((i) => [i.id, i]));
    for (const [id, g] of this.grabs) {
      const input = byId.get(id), p = input && this.handlePoint(input, g);
      if (p) g.local = this.toLocal(p);
    }
    this.pair = null;
  }

  carry(dt, inputs, head) {
    const byId = new Map(inputs.map((i) => [i.id, i]));
    const held = [...this.grabs].map(([id, g]) => [byId.get(id), g]).filter(([i]) => i);
    const root = this.root;

    if (held.length === 1) {
      const [input, g] = held[0], p = this.handlePoint(input, g);
      if (!p || !g.local) return;
      // Turns round the hand to face you, easing; its lean stays as it is.
      const n = v3(0, 0, 1).applyQuaternion(root.quaternion), flat = Math.hypot(n.x, n.z);
      const to = head.clone().sub(root.position);
      if (flat > 0.1 && Math.hypot(to.x, to.z) > 0.05) {
        let turn = Math.atan2(to.x, to.z) - Math.atan2(n.x, n.z);
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, turn * (1 - Math.exp(-dt / P.faceEase))));
      }
      // The point taken stays under the fingers.
      root.position.copy(p).sub(g.local.clone().applyQuaternion(root.quaternion));
    } else if (held.length >= 2) {
      const [[ia, ga], [ib, gb]] = held, a = this.handlePoint(ia, ga), b = this.handlePoint(ib, gb);
      if (!a || !b) return;
      if (!this.pair) this.pair = { a: a.clone(), b: b.clone(), q: root.quaternion.clone(), p: root.position.clone(), s: this.scale };
      const o = this.pair, mid0 = o.a.clone().lerp(o.b, 0.5), mid = a.clone().lerp(b, 0.5);
      const span0 = o.b.clone().sub(o.a), span = b.clone().sub(a);
      // Scale by how far apart the hands are, half to twice its opening size.
      this.scale = THREE.MathUtils.clamp(o.s * (span.length() / Math.max(1e-4, span0.length())), P.scaleMin, P.scaleMax);
      const k = this.scale / o.s;
      // Turn as the hands turn, past a small dead zone so holding still doesn't wobble.
      const turn = new THREE.Quaternion().setFromUnitVectors(span0.normalize(), span.normalize());
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(turn.w, -1, 1)), dead = THREE.MathUtils.degToRad(P.deadZone);
      const axis = v3(turn.x, turn.y, turn.z);
      if (angle <= dead || axis.lengthSq() < 1e-12) turn.identity();
      else turn.setFromAxisAngle(axis.normalize(), angle - dead);
      root.quaternion.copy(turn).multiply(o.q);
      root.position.copy(mid).add(o.p.clone().sub(mid0).multiplyScalar(k).applyQuaternion(turn));
      this.sheet.scale.setScalar(this.scale);
    }
  }

  hide() { this.root.visible = false; }
}
