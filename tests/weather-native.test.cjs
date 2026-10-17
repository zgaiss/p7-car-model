const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/src/main/java/com/show/p7/WeatherController.java'), 'utf8');
const activity = fs.readFileSync(path.join(root, 'app/src/main/java/com/show/p7/MainActivity.java'), 'utf8');

test('offline JVM tests execute the production policy, using synthetic coordinates only', (t) => {
  if (spawnSync('javac', ['-version']).error) return t.skip('JDK unavailable; install JDK 17+ to run native policy checks');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p7-weather-policy-'));
  try {
    // Extract the standalone, Android-free production class verbatim, without reimplementing it.
    const policy = source.slice(source.indexOf('final class WeatherPolicy {'));
    fs.writeFileSync(path.join(temp, 'WeatherPolicy.java'), 'package com.show.p7;\nimport java.util.Locale;\n' + policy);
    const compiled = spawnSync('javac', ['-d', temp, path.join(temp, 'WeatherPolicy.java'), path.join(__dirname, 'native-weather/WeatherPolicyTest.java')], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr);
    const run = spawnSync('java', ['-cp', temp, 'com.show.p7.WeatherPolicyTest'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /checks passed \(offline\)/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('weather has independent opt-in bridge, foreground lifecycle and permission request', () => {
  assert.match(activity, /addJavascriptInterface\(new AndroidWeatherBridge\(\), "AndroidWeatherBridge"\)/);
  for (const method of ['getWeatherState', 'setWeatherEnabled', 'requestWeatherLocationPermission']) assert.match(activity, new RegExp(method));
  for (const method of ['onResume', 'onPause', 'destroy', 'onPageReady', 'onPermissionResult']) assert.match(activity, new RegExp('weatherController\\.' + method + '\\('));
  assert.equal((source.match(/activity\.requestPermissions\(/g) || []).length, 1);
  assert.match(source, /requestPermissions\(new String\[\]\{Manifest\.permission\.ACCESS_COARSE_LOCATION\}, REQUEST_LOCATION\)/);
  assert.doesNotMatch(source, /LightSdkController|android\.util\.Log|requestSingleUpdate|ACCESS_BACKGROUND_LOCATION/);
  assert.match(source, /getNoBackupFilesDir\(\)/);
  assert.match(source, /saved\.optBoolean\("enabled", false\)/);
  assert.match(source, /consentVersion/);
});

test('network and location bounded; no redirects, raw coordinate state or logging', () => {
  assert.match(source, /setInstanceFollowRedirects\(false\)/);
  assert.match(source, /setConnectTimeout\(8_000\)/);
  assert.match(source, /setReadTimeout\(8_000\)/);
  assert.match(source, /MAX_RESPONSE_BYTES/);
  assert.match(source, /requestLocationUpdates\(provider, 60_000L, 5_000f/);
  assert.match(source, /main\.postDelayed\(locationTimeout, LOCATION_TIMEOUT_MS\)/);
  assert.match(source, /removeUpdates\(locationListener\)/);
  assert.match(source, /request\.cancel\(true\)/);
  assert.match(source, /connection\.disconnect\(\)/);
  const emit = source.slice(source.indexOf('    private void emit()'), source.indexOf('    private void loadSavedState()'));
  assert.doesNotMatch(emit, /\.put\("(?:latitude|longitude|row|column|location|cell)"/);
  assert.match(emit, /\.put\("revision", \+\+revision\)/);
  assert.match(source, /!gate\.accepts\(generation\) \|\| !mayWork\(\)/);
});


test('remote pages cannot navigate into a native-bridge WebView', () => {
  assert.match(activity, /setSupportMultipleWindows\(false\)/);
  assert.match(activity, /shouldOverrideUrlLoading\(WebView view, WebResourceRequest request\)/);
  assert.match(activity, /request\.isForMainFrame\(\) && request\.hasGesture\(\)/);
  assert.match(activity, /"\/android_asset\/index\.html"\.equals\(uri\.getPath\(\)\)/);
  assert.match(activity, /userGesture && "https"\.equals\(uri\.getScheme\(\)\)/);
  assert.match(activity, /new Intent\(Intent\.ACTION_VIEW, uri\)\.addCategory\(Intent\.CATEGORY_BROWSABLE\)/);
  assert.match(source, /appOps\.startWatchingMode\(AppOpsManager\.OPSTR_COARSE_LOCATION/);
  assert.match(source, /appOps\.stopWatchingMode\(permissionListener\)/);
});
