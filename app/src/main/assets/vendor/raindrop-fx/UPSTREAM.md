# raindrop-fx selected MIT sources

Source: https://github.com/SardineFish/raindrop-fx
Pinned commit: bae4081bc15815bb094ea040a976dca083bbc3a5
License: MIT, retained in LICENSE; copyright SardineFish 2020.
Downloaded 2026-10-17 from official raw.githubusercontent.com commit URLs.

Retained original compose.glsl, raindrop-frag.glsl, raindrop-vert.glsl,
raindrop.ts (renamed raindrop-upstream.ts), and assets/img/raindrop.png.
No demo background image (credited separately to Pixiv) is used.
The raindrop normal-map PNG has no separate license exception in the repository;
this records the upstream licensing statement, not an independent title warranty.

Application adaptation in glass-rain.js:
- Actual upstream refraction, Lambert and Blinn highlight equations, normal map,
  and premultiplied normal/size packing reused; GLSL300 translated to GLSL100.
- Existing Three r148 renderer renders one scene RT, one reduced-resolution drop
  normal RT, then the unchanged scene to screen plus a transparent drop-only compose pass.
  This preview incurs an additional full scene render for refraction; this is
  a known cost requiring target-device profiling, not a production performance claim. No ZograRenderer or second WebGL context.
- Reduced fixed 12-droplet population and 12 short-trail sprites, one batched mesh.
  Gravity/resistance/slip/stretch model adapted from updateRaindrop; no collision
  grid, merging, mist, or unbounded spawn. Short trails are capped presentation
  adaptations, not the full upstream split simulator.
- Shared application RAF, delta cap, UI/car masks, resize and dispose added.
- Final Three tone mapping/encoding added for the offscreen-render pipeline.
- No claim that upstream unchanged demo performance is reproduced.
02ee6fa9e139e5c3dd3e65687af5acd193663ad6dd340ed06e9bac174aa6541d  app/src/main/assets/vendor/raindrop-fx/compose.glsl
70cdfaaa0616a43a496d75b79bfad0fa69af5169d307bdf01ccf2ad60ca41e15  app/src/main/assets/vendor/raindrop-fx/raindrop-frag.glsl
a932fb3f03e13f658e5b8f3d87620d9e909503bde6b8ece97f9151cef0d9b06d  app/src/main/assets/vendor/raindrop-fx/raindrop-vert.glsl
a6123c516de0c93c6d6d7fde3a70294e9bc67a669c8d8a4b6fc72b98feb029bd  app/src/main/assets/vendor/raindrop-fx/raindrop.png
dc03ebc3089e9e9fe76b5bbcb59b1bf365b6234f5584a5a2ba642f408729bd79  app/src/main/assets/vendor/raindrop-fx/LICENSE

Detail iteration: independent adhesion/slip intervals, size/asymmetric-UV hierarchy,
short trails from travelled distance fading over 1.6s; still a bounded adaptation.
Refraction scene capture throttled to at most 10Hz simulation time; the normal
scene remains full-rate. Camera motion can show <=100ms stale droplet refraction.
