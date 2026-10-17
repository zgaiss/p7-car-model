# Compact vinyl metadata

Approved compact treatment: local static vinyl, transparent background, left-aligned title/artist, no controls or rotation. At 1180×680 the group is approximately 274×66 CSS px, vinyl 62 px. Long titles use two clipped lines; missing artist collapses its row. <=520 px uses a 52 px record above the existing DOM lyric region. Day/night text follows the existing music tone. Shared spectrum safe-area positioning is retained for all four styles.

Open `tests/song-metadata-preview.html` through a local HTTP server for browser QA. Controls simulate missing/long/empty/paused/error/same-name metadata, four spectrum styles, narrow layout and daylight. Preview content is original and does not represent actual vehicle data. Production has no mock metadata.

## Data boundary

`transact(19)` retains the already-read `mediaId` and distinguishes explicit no-media from errors. No extra Parcel fields or permissions were added. `mediaState` is `available`, `empty` or `error`; older bridge payloads remain supported. Brief read errors retain the last good display for up to five seconds; a stale heartbeat or continued errors shows unavailable. Pause does not erase metadata. Metadata is independent of lyric fingerprint/clock and has no extra animation loop.

Real artwork is **not integrated**: no verified vehicle artwork contract exists. `album` is not interpreted as an image URI, no external cover lookup occurs, and every track uses the packaged SVG default. A future verified artwork adapter must provide source-scoped identity, request generation and size-bounded native-decoded local resources; it must reject late images after track changes and fail back to the local default. Do not add arbitrary URL/file/content URI handling to this module.

Run all regression tests: `node --test tests/*.test.cjs tests/*.test.js`. Build: `./gradlew assembleDebug` with JDK 17 / SDK 36. Browser screenshots are development validation, not Android/vehicle testing.

## Verification record

93 Node regression tests passed. `assembleDebug` passed; packaged HTML, module and SVG were checked against final source bytes. Browser checks covered normal, missing artist, long title, no media, pause, narrow/day/night, and the four spectrum styles. The shared safe-area offset adds 12 px clearance for the vinyl. Red paint is a preview preference only, not a production default change.

Additional `lintDebug` failed with 5 existing permission/constant errors in `NativeUtils.java`, unchanged byte-for-byte from base commit 46a0203. No suppressions or unrelated SDK modifications were made. Android/vehicle runtime validation remains outstanding.
