# Color cube

A WebXR color picker. An RGB cube, every point on it its own color, rides above your left hand. Your right hand picks:

- **Pinch** the cube and slide: the ring follows at a third of your hand's movement, so a calm hand finds a fine color. Past an edge it goes over onto the next face, and the cube rolls to bring that face round.
- **Touch** it with your index fingertip: the ring goes where you touch.
- **Controller**: point at the cube and hold the trigger.

Without a left hand (or controller) the cube waits in front of you. Without a headset, drag on it with the mouse.

Passthrough (immersive AR) is used where the browser offers it, otherwise VR. Built with three.js, no build step: `index.html`, `main.js`, and the cube's rules in `cube.js` (`node cube.test.mjs` tests them). Embedded in an iframe, the iframe needs `allow="xr-spatial-tracking"`.

Ported from the color cube in a Unity Quest prototype.
