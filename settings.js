// The cube's look and feel. Open the page with ?tune to edit these live (tune.js): "Copy values" puts what changed on
// the clipboard, to paste back here. Sizes in meters unless noted, times in seconds, angles in degrees.

export const LOOK = {
  size: 0.0615,           // the cube's edge
  roundness: 0.15,        // of the edge, how round the cube's and tiles' edges are (0.5: a pill)
  tilt: -8,               // how far it tips back (top showing), or forward when negative
  yaw: -42,               // how far it turns, so an edge points at you
  edgeColor: '#ffffff',   // lines along the cube's edges
  edgeOpacity: 0,
  ringColor: '#ffffff',
  ringOpacity: 1,
  ringRadius: 0.00675,
  ringWidth: 0.00225,
  ringLift: 0.00045,      // off the face, so it doesn't sink into it
  gridN: 3,               // held still, the face breaks into this many tiles each way
  gridSpan: 0.53,         // of each color channel, all the tiles together
  tileGap: 0.19,          // of a tile, the gap between tiles
  tileLift: 0.08,         // of the cube's edge, how far the tiles lift off the face
  tileTip: 1,             // how much the tiles tip as they part
  tileShade: 1,           // how much darker a block's sides are than its face
  crumbLife: 3,           // the rest of the cube falling away: how long a block lasts
  crumbFall: 0.75,        // m/s², how fast it falls
  crumbPush: 0.03,        // m/s, how hard it's pushed back off the face
  bgInner: '#2a241e',     // the page without a headset
  bgOuter: '#15120f',
  fov: 40,
  distance: 0.24,         // the camera, from the cube
  height: 0.0525,         // and above it
  floatHeight: 0.003,     // idle, how far it drifts up and down
  floatPeriod: 3          // and how long one rise and fall takes
};

export const FEEL = {
  abovePalm: 0.03,        // how far off the left palm (out of it) its lowest corner floats
  controllerTop: 0.05,    // from a left controller's grip to its top, along the handle
  aboveController: 0.005, // how far above that top its lowest corner rides
  paletteEase: 0.12,      // it eases after the hand, so tracking doesn't shake it
  reach: 0.03,            // a pinch this close to the cube takes the ring
  touch: 0.008,           // a fingertip this close to the cube picks where it touches
  drag: 0.45,             // of the hand's movement, the ring's: a calm hand for a fine color
  ringEase: 0.1,          // the ring and the hand moving it ease after where they're going, like friction
  roll: 0.9,              // rolling onto the face the ring went over to
  faceStick: 0.12,        // of the cube's size, a touch can stray off the ring's face before it goes to the next
  pinchOn: 0.025,         // thumb to index tip, to pinch
  pinchOff: 0.045,        // and to let go
  linger: 0.1,            // held still this long while picking, the face breaks into tiles
  lingerStill: 0.012,     // of the cube's size, the ring can drift and still be still
  shatter: 0.45,          // the face parting into tiles, and closing up again
  tileStagger: 0.2        // of that, how far apart the tiles start
};

// The paper in front of you, and the frosted-glass frame round it that carries it.
export const PANEL = {
  width: 0.56,            // the paper, as it opens
  height: 0.4,
  distance: 0.55,         // straight ahead of you
  below: 0.15,            // under eye height
  lean: 15,               // degrees it leans back toward you
  paper: '#f6f2e9',
  ink: 0.003,             // the line's width
  penDown: 0.006,         // a fingertip this close to the paper draws
  penUp: 0.012,           // and lifts off this far from it
  band: 0.016,            // the frame, across
  thickness: 0.004,
  corner: 0.01,           // its outer corners' rounding
  glass: 0.03,            // how opaque the glass is
  showNear: 0.15,         // a hand or controller this close shows the frame
  hideFar: 0.2,           // and nothing within this hides it
  fade: 0.15,             // seconds to fade in or out
  grabHand: 0.03,         // a pinch this close to the frame takes it
  grabGrip: 0.1,          // a controller's grip this close
  faceEase: 0.1,          // seconds: carried, it turns to face you, most of the way in about a quarter second
  deadZone: 4,            // degrees two hands turn before it does
  scaleMin: 0.5,          // two hands scale it, of its opening size
  scaleMax: 2
};
