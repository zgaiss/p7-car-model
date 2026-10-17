# P7 visualizer provenance and adaptation

## SoundVisualizer
Official repository: https://github.com/CaYatur/SoundVisualizer
Pinned commit: 03c72cbc7483069a2777ad81d47e9b330e510687
Package version: 3.1.5. License: MIT, copyright Çağan Turgut (CaYatur), 2026.
Upstream source copies are retained beside this document. `source-hashes.json` records retrieval URLs, SHA-256 and lengths. These are source modules extracted from an Electron application, not a separately maintained published SDK.

### Ribbon input adaptation
`ribbon-spectrum.patch` shows every modification against upstream `ribbon.js`:
- Replace unsigned PCM `audio.timeBytes` with `audio.getSpectrumCurve(168)`.
- Accept signed finite Float32 values in [-1,1], with range/NaN protection, instead of subtracting 128 from PCM bytes.
- Store a new history row only when `audio.spectrumRevision` changes. Revision MUST change only for a fresh native FFT packet (about every 160 ms), not every render frame.
- Retain upstream 26-layer geometry, perspective shrink, opacity, stroke and glow drawing.

The adapter supplies a smoothed, centered artistic mapping of 64 native log-frequency bins. This is **frequency-history artwork, not PCM, an oscilloscope waveform, or reconstructed audio**. Input bins are individually normalized 30 Hz–10 kHz values; do not interpret their average as calibrated volume, or apply a second log-frequency remapping. Source comments describing waveform refer to the original implementation; the explicit P7 header and this document describe the changed semantics.

Terrain uses upstream `audio.getBars` geometry. Its 26 Hz history sampling can sample an interpolated envelope: that is animation sampling, not a claim of 26 Hz native FFT acquisition. Native input remains approximately 6.25 Hz. Pausing, stale input and zero-energy visibility must be handled by the shared lifecycle/opacity adapter. Both modes must use custom colors or supply `SV.sampleThemeColor` when selecting theme colors.

## SiriWave
Official repository: https://github.com/kopiro/siriwave
Pinned commit: 744cb00235b7900733efff25dc73b4d1ab77c92d
Package version: 2.4.0. License: MIT, copyright Flavio Maria De Stefano, 2020.
Vendored source: https://raw.githubusercontent.com/kopiro/siriwave/744cb00235b7900733efff25dc73b4d1ab77c92d/dist/siriwave.umd.js
The unminified official UMD is 20,909 bytes, unchanged. Retain its MIT license in application distribution.

SiriWave is an amplitude-driven decorative multi-curve renderer, not a frequency-spectrum renderer. P7 drives its amplitude from relative input activity. This does not recover absolute loudness. `autostart:false` lets the host own one animation loop; manual drawing uses clear/interpolation/draw corresponding to upstream startDrawCycle (iOS9 advances its own per-curve phases), without invoking its recursive scheduling. Silence must suppress its internally randomized decorative movement.

All sources are vendored for offline use. No CDN or microphone permission is needed for drawing. Canvas filter/glow support and frame cost still require real Android WebView testing; no target-device performance claim is made here.

### Terrain stroke-width adaptation
`terrain-linewidth.patch` adds optional `visualizer.lineWidth` in backing-canvas pixels. The default retains upstream sizing; geometry/history are unchanged. This compensates for downscaled narrow bottom-band display.

### SiriWave fixed-version timing adaptation
The host adjusts each iOS9 curve `DESPAWN_FACTOR` to `0.02 * min(15, dt * 60)` before draw. Upstream uses frame-based growth/decay but wall-clock lifetimes; low rendering FPS otherwise suppresses visible growth. This accesses a fixed-version internal property, not a public API; the vendored SiriWave source remains unchanged.
