# Foreground weather integration (unreleased)

## Consent and data boundary
Default off. The app UI explains Open-Meteo, approximate 5 km position grid, usual 15-minute refresh, possible earlier refresh on coarse-grid boundary crossing (not a strict 5 km displacement threshold), and free API non-commercial restriction. Explicit enabling is separate from foreground location permission. No coordinates pass into JavaScript or UI. No exact location logging or trajectory history. Repeated coarse requests can nevertheless reveal approximate movement; provider receives IP and may retain coordinate-bearing troubleshooting logs for 90 days. Turning off clears consent/cache and cancels weather activity. Background pauses weather activity. Existing traffic-light permission flow is separate and unchanged.

No user location was accessed or sent during cloud development. Current tests use offline fixtures. Actual GPS accuracy, vehicle permissions and network behavior require user vehicle verification.

## Provider contract
- Official docs: https://open-meteo.com/en/docs
- Free API/Privacy: https://open-meteo.com/en/terms
- Data license: https://open-meteo.com/en/licence
- Current data comes from 15-minute weather model data, not a live vehicle sensor
- Fields: weather_code, is_day, precipitation, wind_speed_10m, wind_direction_10m, wind_gusts_10m; explicit km/h, mm, unixtime and timezone=auto
- current.time is converted from epoch seconds to milliseconds; precipitation is the sum over current.interval seconds, not mm/h
- Data attribution CC BY 4.0; free endpoint is non-commercial and has rate limits. Source openness does not remove hosted API restrictions

## Presentation
The native bridge emits only weather/status/timestamps. WeatherState validates and derives visuals; UI displays unavailable/stale conditions honestly. Data becomes stale after 30 minutes and effects disappear after 60 minutes; stale effects reduce and transition using existing shared frame loop. Failed fetches never become clear sky. Night stars require clear/mainly-clear weather, provider night, and actual night scene. Automatic time sync accepts fresh provider is_day; manual sky selection takes priority. Rain/snow drift strength uses bounded model wind; screen drift direction is decorative because no heading-to-camera mapping exists. No lightning flashes.

Fog reuses world-distance ground fog and sky-only HDR haze, with a shared-frame fade. Particle buffers stay bounded at rain160/snow80/stars100. Off/unknown states clear existing effects, and effects are lazy-created on first usable weather data. No JavaScript GPS, HTTP, independent RAF or polling timer is added.

## Validation (2026-10-17)
- 144/144 Node tests pass with cached JDK17 in PATH, including 40,055 offline production Java policy assertions
- Independent read-only review completed; fixed native-to-JS revision mismatch, stale callback reactivation, refresh-cache flicker, continuous wind mapping, faded resource cleanup, short-display consent scroll, persistent bridge failure feedback, and strict native JSON numeric parsing
- assembleDebug succeeds; APK is local only, not installed or published
- lintDebug is not green: five existing NativeUtils.java errors (two READ_PRIVILEGED_PHONE_STATE, three WrongConstant), no WeatherController lint entry. Existing traffic-light behavior was preserved
- Actual cloud-browser UI component checked at default off, disclosure, and permission-required steps with explicit offline fixture. Browser rendering later interrupted with error 9 before final unavailable-state pixel verification; unit tests cover that state
- JavaScript syntax checks and git diff --check pass. Native Android lifecycle, vehicle GPS and live HTTP were not exercised; these remain device acceptance tests

## Vehicle acceptance checklist
Enable deliberately after reading consent; deny location and ensure no weather requests. Enable coarse permission, obtain current model weather, verify manual sky override wins. Background app during request and verify cancellation/no background updates. Return foreground, remove system permission or disable location, then turn weather off and verify effects fade and no future requests. Move across coarse grid, test network loss/timeout, and verify old response cannot replace new location/disabled state. Check frame time and memory on vehicle hardware; cloud rendering is not vehicle performance evidence.
