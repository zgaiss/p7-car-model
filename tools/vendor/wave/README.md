# Wave.js Cubes upstream source

Package: @foobar404/wave 2.0.5, MIT, Austin Michaud.
Official package: https://registry.npmjs.org/@foobar404/wave/-/wave-2.0.5.tgz
Verified package SHA512: V/ydadtv5ObCw8aEg+Qy3YSq1eyinEWzJfRI43Ovmj7VmAvEdWAdL7MatoMbiIVYPATkNDVF7GOxX1xirxM9dA==
Source revision from package gitHead: 03b29e841a9d0dbce5845bb6faf75b9b0088c49f
Repository: https://github.com/foobar404/wave.js

The three source files are unchanged from that revision. Type-only imports are erased by esbuild. Bundle contains Cubes, Shapes, AudioData only; no top-level Wave/audio engine.
Build command (esbuild 0.25.10):
esbuild tools/vendor/wave/src/animations/Cubes.ts --bundle --format=iife --global-name=P7WaveCubes --target=es2017 --outfile=app/src/main/assets/vendor/wave/cubes-2.0.5.js

The MIT license is retained beside the browser bundle. App adapter calls upstream Cubes.draw(Uint8Array, context), disables library's linear-bin frequencyBand slicing, and performs only native-data smoothing and canvas compositing. No renderer reimplementation or fake audio node.
