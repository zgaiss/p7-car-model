# Lyrics typography preview

This change is presentation-only. Production reads the existing `window.__lyricData` bridge and retains its playback/position semantics. No cover art, spectrum, media integration, model, paint, camera or opening implementation is changed.

## Preview

Serve the repository root and open `tests/lyrics-preview.html` in a WebGL-capable browser. The toolbar explicitly labels all sample song/artist/lyric content as original demonstration data, not vehicle playback. The harness is outside Android assets and is not packaged.

Buttons cover normal content, long Chinese/English content, no lyrics, no media and a 390 × 700 viewport. Returning to landscape restores the existing 3D lyric plane. Narrow layouts reuse the same current-line DOM data above the car. Long active lyrics are limited to two lines with an explicit ellipsis; neighbouring lyrics remain one line. Short-line spacing is tighter than wrapped-line spacing.

## Validation (2026-10-17)

- `node --test tests/*.cjs tests/*.js`: 54 passed, 0 failed.
- `gradle --offline --no-daemon assembleDebug`: passed with Java 17 / Android SDK 36; only existing deprecated API and native library stripping warnings.
- `git diff --check`: passed.
- Actual cloud Chromium with software WebGL: normal / long / no lyrics / no media, repeated landscape ↔ 390px narrow layout, default loading to model, door open / close, settings open / close.
- Existing tests cover scene grounding, reflection, camera persistence, car paint and door interactions. New tests cover wrapping, Unicode, stable current-line anchor, typography, metadata-only LRC and responsive layer selection.

This is a browser preview plus debug-build verification, not validation on a physical P7 head unit. No release or remote push is part of this preview.
