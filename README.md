# Color cube

A WebXR color picker. An RGB cube, every point on it its own color, rides above your left hand. Your right hand picks:

- **Pinch** the cube and slide: the ring follows at a third of your hand's movement, so a calm hand finds a fine color. Past an edge it goes over onto the next face, and the cube rolls to bring that face round.
- **Touch** it with your index fingertip: the ring goes where you touch.
- **Controller**: point at the cube and hold the trigger.
- **Hold still** while picking (a tenth of a second): the rest of the cube falls away behind the ring's face, and the face parts into 3×3 blocks of the colors around yours, a step of 0.15 per channel apart. Keep sliding across them and let go to take one; slide off them and the cube comes back together.

Without a left hand (or controller) the cube waits in front of you. Without a headset, drag on it with the mouse.

Passthrough (immersive AR) is used where the browser offers it, otherwise VR. Built with three.js, no build step: `index.html`, `main.js`, and the cube's rules in `cube.js` (`node cube.test.mjs` tests them), the tiles' in `grid.js`. Its look and feel (sizes, colors, the tiles, how picking responds) are in `settings.js`; open the page with `?tune` to change them live in a panel, then **Copy values** and paste the changes back into `settings.js`. Changes are kept in that browser, so you can tune in a headset's browser and then enter XR to try them. Embedded in an iframe, the iframe needs `allow="xr-spatial-tracking"`.

Ported from the color cube in a Unity Quest prototype.
