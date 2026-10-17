# Four selectable audio visualizers (development preview)

Run `python3 -m http.server 8786 --directory .`, open `tests/audio-preview.html` in a WebGL-capable browser. The harness feeds a new 64-bin array every **160 ms (6.25 Hz)**. It is simulated input, not a vehicle test. The comparison loop repeats the same 48-packet sequence for each style. No PCM or sound is reconstructed.

Settings contain a master switch and four validated, persisted choices under `p7.spectrum.v1`:
- 彩色波带: SiriWave 2.4.0 iOS9. Relative activity drives decorative amplitude and speed.
- 渐变丝带: SoundVisualizer Ribbon geometry, with an explicitly patched frequency-history input. Centered frequency magnitudes are artistic curves, **not an oscilloscope waveform**.
- 多层山脊: SoundVisualizer Terrain, using interpolated native frequency magnitudes directly through getBars.
- 彩色柱状: Wave.js Cubes 2.0.5, with tint, short peak hold and a shallow mirror.

## Lifecycle and limits
- Reuses the existing app RAF. SiriWave autostart is disabled; its per-curve fade increment is scaled to elapsed time (pinned internal JS property DESPAWN_FACTOR) to avoid failing to grow before wall-clock expiry at low FPS. Library geometry is unchanged.
- One active renderer and a frozen outgoing snapshot for a 380 ms crossfade; no two renderer loops. Both image buffers are 1024×256; LED temporarily uses 640×256; display DPR ≤ 2.
- Ribbon stores ≤26 genuine packet revisions, each 168 points. Terrain stores ≤26 interpolated animation rows of 56 points; its 26 Hz row sampling is not a claim of 26 Hz acquisition.
- Audio packet expiry 500 ms, media expiry 2500 ms. Pause/non-playing status stops targets; release converges to exactly zero. Silent output is a static thin line; hidden state resets; final pagehide disposes canvases.
- The total switch clears the old bridge frame before resuming, so reopening cannot replay a previously cached packet.
- Canvas glow is a single downsampled blur, not per-point shadow blur. There are no particles or audio capture requests.

## Provenance
MIT licenses and pinned official sources are retained in assets/vendor and tools/vendor. `tools/vendor/soundvisualizer` documents the exact Ribbon input and Terrain line-width patches. The prior single-line and standalone LED experiments remain in separate worktrees/commits and are not the three curve choices.

## Limits
Desktop software-rendered Chromium confirms appearance and interactions, not vehicle performance. Android WebView rendering cost, filters and native microphone/media integration still require a device test. Relative per-bin normalized input cannot establish calibrated loudness, stereo or phase information. Native FFT, car model, camera and paint interfaces are unchanged. The media polling heartbeat now runs every second even when position is unavailable (pos = -1), preserving the 2500 ms stale-media gate without silencing valid playback.

## Verified in this preview
- `node --test tests/*.test.*`: 78 tests passed (16 input/settings + 8 real-vendor renderer tests included).
- Offline Android `assembleDebug`: successful. No vehicle installation or real native-audio playback test performed.
- Cloud software-WebGL browser: four modes rendered; setting dropdown exposes all four; selecting Terrain and disabling master survives page reload. Screenshots before/after retained with preview media. Re-enable waits for a fresh FFT packet.
- The comparison image contains actual UI captures with the same repeated synthetic sequence; representative frames are not simultaneous. The labeled central crops are enlarged without altering colors or geometry.
