# three-nebula 13.3.0

Official package: https://registry.npmjs.org/three-nebula/-/three-nebula-13.3.0.tgz
Repository: https://github.com/creativelifeform/three-nebula
MIT license retained in LICENSE.md. UMD file is unmodified, 82,837 bytes.
SHA256: 5799df08fc7364be93c40f59eb8c48cc3ac33e5a16bc2e0cb71b16b2698001e7
Retrieved 2026-10-17 using npm pack. No install scripts executed.
UMD uses external window.THREE; no second Three runtime or WebGPU entry included.

Snow recipe source:
https://github.com/creativelifeform/three-nebula/blob/master/website/components/Examples/SpriteRendererSnow/init.js

The prototype reuses Nebula System/Emitter, Position/BoxZone, Mass, Radius, Life,
RadialVelocity, RandomDrift and Gravity. Density and units are reduced for a
quiet screen-background effect. Rain uses the same engine with greater downward
velocity; stars use a stationary emitter.

Application adaptations: existing Three Points batch presentation (rather than
upstream per-particle SpriteRenderer); shader mask protects UI and car;
finite fixed population with boundary recycling replaces continuous emission
and upstream camera ScreenZone; no upstream textures/assets downloaded.
These adaptations are not upstream performance guarantees or an unchanged demo.
13.3.0 emit('once') is declared but its implementation checks numeric 1;
use emit(1), restore emitter.life=Infinity, then stopEmit() after first step.
Particle counts are explicitly regression-tested.
