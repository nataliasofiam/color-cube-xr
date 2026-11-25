// Look-and-feel customizer: open the page with ?tune. Every control edits settings.js's LOOK and FEEL live; "Copy values"
// puts the changed settings on the clipboard to paste back into settings.js. Kept in this browser between reloads, so
// tune in a headset's browser and then enter XR to feel it.
const KEY = 'color-cube-tune';

// [key, label, min, max, step, unit] for sliders, where `unit` multiplies the stored value for display (100: meters
// shown as cm); [key, label, 'color'] for colors. Sliders show the stored value's units unless they say otherwise.
const GROUPS = [
  ['LOOK', 'Cube', [['size', 'Edge (cm)', 1, 40, 0.1, 100], ['roundness', 'Rounded edges', 0, 0.5, 0.01], ['tilt', 'Tipped back (°)', -90, 90, 0.5], ['yaw', 'Turned (°)', -180, 180, 1],
    ['edgeColor', 'Edge line color', 'color'], ['edgeOpacity', 'Edge line opacity', 0, 1, 0.01]]],
  ['LOOK', 'Ring', [['ringColor', 'Color', 'color'], ['ringOpacity', 'Opacity', 0, 1, 0.01], ['ringRadius', 'Radius (mm)', 1, 50, 0.1, 1000],
    ['ringWidth', 'Width (mm)', 0.2, 10, 0.1, 1000], ['ringLift', 'Lift off face (mm)', 0, 5, 0.1, 1000]]],
  ['LOOK', 'Tiles', [['gridN', 'Tiles each way', 2, 7, 1], ['gridSpan', 'Color range across them', 0.05, 1, 0.01], ['tileGap', 'Gap', 0, 0.6, 0.01],
    ['tileLift', 'Lift (of edge)', 0, 0.5, 0.01], ['tileTip', 'Tip as they part', 0, 4, 0.05], ['tileShade', 'Side shading', 0, 1.5, 0.01]]],
  ['LOOK', 'Falling away', [['crumbLife', 'Lasts (s)', 0.1, 3, 0.05], ['crumbFall', 'Gravity (m/s²)', 0, 10, 0.05], ['crumbPush', 'Push (cm/s)', 0, 20, 0.1, 100]]],
  ['LOOK', 'Levitation', [['floatHeight', 'Drift up and down (mm)', 0, 20, 0.5, 1000], ['floatPeriod', 'One rise and fall (s)', 0.5, 10, 0.1]]],
  ['LOOK', 'Page (no headset)', [['bgInner', 'Background center', 'color'], ['bgOuter', 'Background edge', 'color'], ['fov', 'Field of view (°)', 10, 90, 1],
    ['distance', 'Camera distance (cm)', 5, 150, 0.5, 100], ['height', 'Camera height (cm)', -60, 60, 0.5, 100]]],
  ['FEEL', 'Picking (headset)', [['drag', 'Drag ratio', 0.05, 3, 0.01], ['ringEase', 'Ring friction (s)', 0, 0.5, 0.01], ['roll', 'Roll to next face (s)', 0.1, 3, 0.05],
    ['faceStick', 'Face stickiness', 0, 0.5, 0.01], ['reach', 'Pinch reach (cm)', 0, 10, 0.1, 100], ['touch', 'Touch reach (mm)', 0, 30, 0.5, 1000],
    ['pinchOn', 'Pinch closes at (mm)', 5, 40, 0.5, 1000], ['pinchOff', 'Pinch opens at (mm)', 10, 80, 0.5, 1000]]],
  ['FEEL', 'Breaking into tiles', [['linger', 'Hold still for (s)', 0.02, 2, 0.01], ['lingerStill', 'Still enough', 0.001, 0.08, 0.001],
    ['shatter', 'Parting time (s)', 0.05, 2, 0.01], ['tileStagger', 'Stagger', 0, 0.9, 0.01]]],
  ['FEEL', 'On the hand or controller', [['abovePalm', 'Off palm (cm)', 0, 25, 0.5, 100], ['controllerTop', 'Controller grip to top (cm)', 0, 15, 0.5, 100],
    ['aboveController', 'Above controller (cm)', 0, 25, 0.5, 100], ['paletteEase', 'Follow lag (s)', 0, 0.6, 0.01]]]
];

const CSS = `
.tune{position:fixed;top:12px;right:12px;bottom:84px;width:290px;z-index:100;display:flex;flex-direction:column;font:12px/16px system-ui,-apple-system,"Segoe UI",sans-serif;color:#eee;background:rgba(18,16,14,.9);border:1px solid rgba(255,255,255,.14);border-radius:12px;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 10px 40px #0008}
.tune.is-min .tune__body,.tune.is-min .tune__foot{display:none}.tune.is-min{bottom:auto}
.tune__head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);font-weight:600}
.tune__body{flex:1;overflow-y:auto;padding:4px 12px 12px}
.tune h3{display:flex;justify-content:space-between;margin:16px 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8d857b}
.tune h3 small{font-weight:400;letter-spacing:0;text-transform:none;color:#6d665e}
.tune label{display:grid;grid-template-columns:1fr 58px;gap:2px 8px;align-items:center;margin:6px 0}
.tune label.is-changed span{color:#9cf}
.tune input[type=range]{grid-column:1/-1;width:100%;margin:0;accent-color:#e0a76a}
.tune input[type=number]{width:58px;padding:2px 4px;font:inherit;color:#eee;background:#0006;border:1px solid #fff2;border-radius:4px;text-align:right}
.tune input[type=color]{width:58px;height:22px;padding:0;background:none;border:1px solid #fff2;border-radius:4px}
.tune__toggle{display:flex!important;gap:8px;align-items:center;margin:10px 0 0!important;color:#ccc}
.tune__foot{display:flex;gap:6px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.1)}
.tune button{flex:1;padding:7px 8px;font:inherit;color:#eee;background:#ffffff14;border:1px solid #fff2;border-radius:6px;cursor:pointer}
.tune button:hover{background:#ffffff24}
.tune__min{flex:0 0 auto!important;padding:2px 8px!important}
.tune button.is-primary{background:#b8783a;border-color:#d39558}
@media(max-width:600px){.tune{left:12px;width:auto;top:12px;bottom:auto;max-height:50vh}}`;

/** `sets`: { name: [live settings object, its defaults] }. `apply` redraws after a change; `holdTiles(on)` keeps the tiles open. */
export function openTuner({ sets, apply, holdTiles }) {
  const live = (set) => sets[set][0], dflt = (set) => sets[set][1];
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const saved = read();
  for (const set in sets) for (const k in saved[set] || {}) if (k in dflt(set)) live(set)[k] = saved[set][k];

  const changed = () => {
    const out = {};
    for (const set in sets) for (const k in dflt(set)) if (live(set)[k] !== dflt(set)[k]) (out[set] ||= {})[k] = live(set)[k];
    return out;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(changed())); } catch {} };

  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const panel = document.createElement('aside'); panel.className = 'tune'; panel.setAttribute('aria-label', 'Color cube customizer');
  panel.innerHTML = '<div class="tune__head">Look &amp; feel <button type="button" class="tune__min" aria-label="Collapse">–</button></div><div class="tune__body"></div><div class="tune__foot"><button type="button" data-act="reset">Reset</button><button type="button" class="is-primary" data-act="copy">Copy values</button></div>';
  const body = panel.querySelector('.tune__body'), rows = [];

  const round = (v) => Math.round(v * 1e6) / 1e6;
  function sync(r) {
    const v = live(r.set)[r.k];
    r.inputs.forEach((i) => { const shown = r.color ? v : String(round(v * r.unit)); if (i.value !== shown) i.value = shown; });
    r.label.classList.toggle('is-changed', v !== dflt(r.set)[r.k]);
  }
  const set = (r, v) => { live(r.set)[r.k] = v; sync(r); save(); apply(); };

  for (const [setName, title, ctrls] of GROUPS) {
    const h = document.createElement('h3'); h.innerHTML = `${title}<small>${setName === 'FEEL' ? 'feel' : 'look'}</small>`; body.append(h);
    for (const [k, name, min, max, step, unit = 1] of ctrls) {
      const label = document.createElement('label'), span = document.createElement('span'); span.textContent = name; label.append(span);
      const r = { set: setName, k, label, unit, color: min === 'color', inputs: [] };
      if (r.color) {
        const c = document.createElement('input'); c.type = 'color';
        c.addEventListener('input', () => set(r, c.value)); r.inputs = [c]; label.append(c);
      } else {
        const num = document.createElement('input'), rng = document.createElement('input');
        num.type = 'number'; rng.type = 'range';
        for (const i of [num, rng]) {
          Object.assign(i, { min, max, step });
          i.addEventListener('input', () => { const v = parseFloat(i.value); if (!isNaN(v)) set(r, round(v / unit)); });
        }
        label.append(num, rng); r.inputs = [num, rng];
      }
      // Double-click a name to put that one setting back.
      span.title = 'Double-click to reset'; span.addEventListener('dblclick', () => set(r, dflt(setName)[k]));
      rows.push(r); body.append(label); sync(r);
    }
    if (title === 'Tiles') { // keep them open while tuning them
      const t = document.createElement('label'); t.className = 'tune__toggle';
      t.innerHTML = '<input type="checkbox"> Hold tiles open';
      t.querySelector('input').addEventListener('change', (e) => holdTiles(e.target.checked));
      body.append(t);
    }
  }

  panel.querySelector('.tune__min').addEventListener('click', (e) => { const min = panel.classList.toggle('is-min'); e.currentTarget.textContent = min ? '+' : '–'; });
  panel.querySelector('[data-act=reset]').addEventListener('click', () => {
    for (const s in sets) Object.assign(live(s), dflt(s));
    rows.forEach(sync); save(); apply();
  });
  panel.querySelector('[data-act=copy]').addEventListener('click', async (e) => {
    const b = e.currentTarget, c = changed();
    const text = Object.keys(c).length
      ? '// Color cube settings changed from default; paste into settings.js\n' + Object.entries(c).map(([s, o]) => `${s}: ${JSON.stringify(o, null, 2)}`).join('\n')
      : '// No changes from settings.js';
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied!'; }
    catch { console.log(text); b.textContent = 'See console'; }
    setTimeout(() => (b.textContent = 'Copy values'), 1400);
  });
  // Keep the cube's mouse picking from reacting to the panel.
  for (const ev of ['pointerdown', 'pointermove']) panel.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(panel);
  apply();
}
