// The cube's look and feel. Open the page with ?tune to edit these live (tune.js): "Copy values" puts what changed on
// the clipboard, to paste back here. Sizes in meters unless noted, times in seconds, angles in degrees.

export const LOOK = {
  size: 0.04,             // the cube's edge
  tilt: 36.87,            // how far it tips back, so its top shows too
  yaw: -45,               // how far it turns, so an edge points at you
  edgeColor: '#ffffff',   // lines along the cube's edges
  edgeOpacity: 0,
  ringColor: '#ffffff',
  ringOpacity: 1,
  ringRadius: 0.0045,
  ringWidth: 0.0022,
  ringLift: 0.0008,       // off the face, so it doesn't sink into it
  gridN: 3,               // held still, the face breaks into this many tiles each way
  gridSpan: 0.45,         // of each color channel, all the tiles together
  tileGap: 0.16,          // of a tile, the gap between tiles
  tileLift: 0.08,         // of the cube's edge, how far the tiles lift off the face
  tileTip: 1,             // how much the tiles tip as they part
  tileShade: 1,           // how much darker a block's sides are than its face
  crumbLife: 0.7,         // the rest of the cube falling away: how long a block lasts
  crumbFall: 0.5,         // m/s², how fast it falls
  crumbPush: 0.02,        // m/s, how hard it's pushed back off the face
  bgInner: '#2a241e',     // the page without a headset
  bgOuter: '#15120f',
  fov: 40,
  distance: 0.16,         // the camera, from the cube
  height: 0.035           // and above it
};

export const FEEL = {
  abovePalm: 0.07,        // how far above the left palm it rides
  paletteEase: 0.12,      // it eases after the hand, so tracking doesn't shake it
  reach: 0.03,            // a pinch this close to the cube takes the ring
  touch: 0.008,           // a fingertip this close to the cube picks where it touches
  drag: 0.3,              // of the hand's movement, the ring's: a calm hand for a fine color
  ringEase: 0.1,          // the ring and the hand moving it ease after where they're going, like friction
  roll: 0.9,              // rolling onto the face the ring went over to
  faceStick: 0.12,        // of the cube's size, a touch can stray off the ring's face before it goes to the next
  pinchOn: 0.018,         // thumb to index tip, to pinch
  pinchOff: 0.035,        // and to let go
  linger: 0.1,            // held still this long while picking, the face breaks into tiles
  lingerStill: 0.012,     // of the cube's size, the ring can drift and still be still
  shatter: 0.45,          // the face parting into tiles, and closing up again
  tileStagger: 0.2        // of that, how far apart the tiles start
};
