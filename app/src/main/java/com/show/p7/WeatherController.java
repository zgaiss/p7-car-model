package com.show.p7;

import android.Manifest;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.net.ssl.HttpsURLConnection;

/**
 * Opt-in, foreground-only weather. It never uses the traffic-light SDK or its location stream.
 * Coordinates only exist as a local Location callback argument; only a roughly 5 km cell is kept.
 * API contract: https://open-meteo.com/en/docs (current conditions are model data, not a sensor).
 * All state transitions happen on the main thread; worker results are guarded by a generation.
 */
public final class WeatherController {
    public static final int REQUEST_LOCATION = 1003;
    private static final int CONSENT_VERSION = 1;
    private static final long LOCATION_CHECK_MS = 5 * 60_000L;
    private static final long LOCATION_TIMEOUT_MS = 25_000L;
    private static final long HTTP_TIMEOUT_MS = 20_000L;
    private static final int MAX_RESPONSE_BYTES = 32_768;
    private final Activity activity;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final LocationManager locations;
    private final AppOpsManager appOps;
    private final AtomicFile storage;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final WeatherPolicy.Gate gate = new WeatherPolicy.Gate();
    private final Object connectionLock = new Object();
    private HttpsURLConnection connection;
    private Future<?> request;
    private LocationListener locationListener;
    private Runnable locationTimeout;
    private Runnable httpTimeout;
    private boolean destroyed;
    private boolean permissionDialogPending;
    private boolean previouslyHadPermission;
    private long revision;
    private long lastAttemptElapsed = -1;
    private long nextRetryElapsed;
    private int failures;
    private WeatherPolicy.Cell currentCell;
    private WeatherPolicy.Cell cachedCell;
    private JSONObject cachedWeather;
    private JSONObject displayedWeather;
    private String status = "disabled";
    private String error;
    private volatile String snapshot = "{\"enabled\":false,\"consented\":false,\"status\":\"disabled\",\"revision\":0,\"stale\":true}";

    private final Runnable tick = this::locate;
    private final AppOpsManager.OnOpChangedListener permissionListener = (op, packageName) -> main.post(this::onPermissionChanged);

    public WeatherController(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        locations = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        appOps = (AppOpsManager) activity.getSystemService(Context.APP_OPS_SERVICE);
        // Explicit consent and coarse cached location must not migrate via Android Auto Backup.
        storage = new AtomicFile(new File(activity.getNoBackupFilesDir(), "weather-v1.json"));
        loadSavedState();
        previouslyHadPermission = hasPermission();
        if (appOps != null) {
            try {
                appOps.startWatchingMode(AppOpsManager.OPSTR_COARSE_LOCATION, activity.getPackageName(), permissionListener);
                appOps.startWatchingMode(AppOpsManager.OPSTR_FINE_LOCATION, activity.getPackageName(), permissionListener);
            } catch (RuntimeException ignored) { /* Some vehicle ROMs omit AppOps; each operation still rechecks permission. */ }
        }
        emit();
    }

    public String getState() { return snapshot; }

    /** Called only after the user accepts the in-app Open-Meteo/location disclosure. */
    public void setEnabled(boolean accepted) {
        main.post(() -> {
            if (destroyed) return;
            if (accepted && gate.enabled) { emit(); return; }
            stopWork();
            gate.setEnabled(accepted);
            failures = 0;
            nextRetryElapsed = 0;
            currentCell = null;
            displayedWeather = null;
            error = null;
            if (!accepted) {
                cachedCell = null;
                cachedWeather = null;
            }
            saveState();
            status = accepted ? (gate.foreground ? "locating" : "paused") : "disabled";
            emit();
            if (accepted && gate.foreground) locate();
        });
    }

    /** This method is deliberately separate from enabling and from Activity.onResume. */
    public void requestLocationPermission() {
        main.post(() -> {
            if (destroyed || !gate.enabled || !gate.foreground || permissionDialogPending) return;
            if (hasPermission()) { locate(); return; }
            permissionDialogPending = true;
            // Weather needs approximate location only; existing fine access is never requested here.
            activity.requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
        });
    }

    public void onPermissionResult() {
        permissionDialogPending = false;
        onPermissionChanged();
        if (gate.enabled && gate.foreground && hasPermission()) locate();
    }

    private void onPermissionChanged() {
        if (destroyed) return;
        boolean granted = hasPermission();
        gate.setPermission(granted);
        if (!granted && (previouslyHadPermission || gate.enabled)) {
            stopWork();
            currentCell = null;
            displayedWeather = null;
            cachedCell = null;
            cachedWeather = null;
            saveState();
            status = gate.enabled ? "permission_required" : "disabled";
            error = gate.enabled ? "location_permission_required" : null;
            emit();
        }
        previouslyHadPermission = granted;
    }

    public void onResume() {
        if (destroyed) return;
        gate.setForeground(true);
        onPermissionChanged();
        if (gate.enabled) locate();
        else emit();
    }

    public void onPause() {
        gate.setForeground(false);
        stopWork();
        currentCell = null;
        displayedWeather = null;
        status = gate.enabled ? "paused" : "disabled";
        emit();
    }

    public void destroy() {
        onPause();
        destroyed = true;
        if (appOps != null) {
            try { appOps.stopWatchingMode(permissionListener); } catch (RuntimeException ignored) { }
        }
        worker.shutdownNow();
    }

    /** Push the latest snapshot when the local page has loaded. */
    public void onPageReady() { if (!destroyed) emit(); }

    private boolean hasPermission() {
        boolean coarse = activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean fine = activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!coarse && !fine) return false;
        if (appOps == null) return true;
        try {
            int mode = appOps.checkOpNoThrow(coarse ? AppOpsManager.OPSTR_COARSE_LOCATION : AppOpsManager.OPSTR_FINE_LOCATION,
                    Process.myUid(), activity.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED || mode == AppOpsManager.MODE_DEFAULT
                    || (android.os.Build.VERSION.SDK_INT >= 29 && mode == AppOpsManager.MODE_FOREGROUND);
        } catch (RuntimeException denied) { return false; }
    }

    private boolean mayWork() {
        boolean granted = hasPermission();
        gate.setPermission(granted);
        if (!granted) onPermissionChanged();
        return !destroyed && gate.active();
    }

    private void locate() {
        main.removeCallbacks(tick);
        if (!mayWork() || locationListener != null || request != null) return;
        if (SystemClock.elapsedRealtime() < nextRetryElapsed) {
            schedule(nextRetryElapsed - SystemClock.elapsedRealtime());
            return;
        }
        if (locations == null) { fail("location_unavailable", "location_service_unavailable"); return; }
        final long generation = gate.generation();
        status = "locating";
        error = null;
        emit();
        try {
            String provider = null;
            if (locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) provider = LocationManager.NETWORK_PROVIDER;
            else if (activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    && locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) provider = LocationManager.GPS_PROVIDER;
            if (provider == null) { fail("location_unavailable", "location_provider_disabled"); return; }
            // A recent platform fix avoids powering a provider for most foreground checks.
            Location recent = locations.getLastKnownLocation(provider);
            if (acceptableLocation(recent)) { useLocation(recent, generation); return; }
            locationListener = new LocationListener() {
                @Override public void onLocationChanged(Location location) { useLocation(location, generation); }
                @Override public void onStatusChanged(String provider, int value, Bundle extras) { }
                @Override public void onProviderEnabled(String provider) { }
                @Override public void onProviderDisabled(String provider) {
                    if (gate.accepts(generation)) {
                        stopLocation();
                        fail("location_unavailable", "location_provider_disabled");
                    }
                }
            };
            // Bounded one-shot acquisition: remove the listener after one fix or 25 seconds.
            // No service, background permission, passive stream or high-frequency GPS polling.
            locations.requestLocationUpdates(provider, 60_000L, 5_000f, locationListener, Looper.getMainLooper());
            locationTimeout = () -> {
                if (!gate.accepts(generation)) return;
                stopLocation();
                fail("location_unavailable", "location_timeout");
            };
            main.postDelayed(locationTimeout, LOCATION_TIMEOUT_MS);
        } catch (SecurityException denied) {
            stopLocation();
            onPermissionChanged();
            if (hasPermission()) fail("location_unavailable", "location_access_unavailable");
        } catch (RuntimeException unavailable) {
            stopLocation();
            fail("location_unavailable", "location_service_unavailable");
        }
    }

    private boolean acceptableLocation(Location location) {
        if (location == null || !location.hasAccuracy() || !Float.isFinite(location.getAccuracy())
                || location.getAccuracy() < 0 || location.getAccuracy() > 10_000f) return false;
        long ageNs = SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos();
        return ageNs >= 0 && ageNs <= LOCATION_CHECK_MS * 1_000_000L
                && WeatherPolicy.validCoordinates(location.getLatitude(), location.getLongitude());
    }

    private void useLocation(Location location, long generation) {
        if (!gate.accepts(generation) || !mayWork() || !acceptableLocation(location)) return;
        // Do not retain, log, serialize, or pass the original Location to another component.
        WeatherPolicy.Cell cell = WeatherPolicy.coarsen(location.getLatitude(), location.getLongitude());
        stopLocation();
        currentCell = cell;
        long now = System.currentTimeMillis();
        boolean matches = cachedCell != null && cachedCell.key.equals(cell.key);
        if (matches && cachedWeather != null && WeatherPolicy.cacheUsable(cachedWeather.optLong("fetchedAt"),
                cachedWeather.optLong("observedAt"), now)) {
            displayedWeather = cachedWeather;
            if (WeatherPolicy.cacheFresh(cachedWeather.optLong("fetchedAt"), cachedWeather.optLong("observedAt"), now)) {
                status = "ready";
                error = null;
                emit();
                long remaining = WeatherPolicy.CACHE_TTL_MS - (now - cachedWeather.optLong("fetchedAt"));
                schedule(Math.min(LOCATION_CHECK_MS, remaining));
                return;
            }
        } else displayedWeather = null;
        long wait = WeatherPolicy.waitForAttempt(SystemClock.elapsedRealtime(), lastAttemptElapsed, nextRetryElapsed);
        if (wait > 0) {
            status = displayedWeather == null ? "loading" : "stale";
            emit();
            schedule(wait);
            return;
        }
        fetch(cell);
    }

    private void fetch(WeatherPolicy.Cell cell) {
        if (!mayWork()) return;
        final long generation = gate.advance();
        lastAttemptElapsed = SystemClock.elapsedRealtime();
        status = "loading";
        error = null;
        emit();
        httpTimeout = () -> {
            if (!gate.accepts(generation)) return;
            cancelRequest();
            fail("error", "request_timeout");
        };
        main.postDelayed(httpTimeout, HTTP_TIMEOUT_MS);
        request = worker.submit(() -> {
            HttpsURLConnection local = null;
            try {
                URL url = new URL(WeatherPolicy.requestUrl(cell));
                local = (HttpsURLConnection) url.openConnection();
                synchronized (connectionLock) {
                    if (!gate.accepts(generation)) { local.disconnect(); return; }
                    connection = local;
                }
                local.setConnectTimeout(8_000);
                local.setReadTimeout(8_000);
                local.setInstanceFollowRedirects(false); // Never send location to a redirect recipient.
                local.setUseCaches(false);
                local.setRequestProperty("Accept", "application/json");
                if (!gate.accepts(generation)) return;
                if (!hasPermission()) { main.post(this::onPermissionChanged); return; }
                int code = local.getResponseCode();
                if (code != 200) throw new IOException(code == 429 ? "rate_limited" : "http_error");
                String body;
                try (InputStream input = local.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[2048];
                    int size;
                    while ((size = input.read(buffer)) != -1) {
                        if (!gate.accepts(generation) || Thread.currentThread().isInterrupted()) return;
                        if (bytes.size() + size > MAX_RESPONSE_BYTES) throw new IOException("invalid_response");
                        bytes.write(buffer, 0, size);
                    }
                    body = bytes.toString(StandardCharsets.UTF_8.name());
                }
                final JSONObject weather = parseWeather(body, System.currentTimeMillis());
                main.post(() -> complete(generation, cell, weather));
            } catch (Exception failure) {
                // Exception messages may contain a URL/coordinates. Never log or expose them.
                final String reason = failure instanceof java.net.SocketTimeoutException ? "request_timeout"
                        : failure instanceof JSONException ? "invalid_response"
                        : "rate_limited".equals(failure.getMessage()) ? "rate_limited" : "network_error";
                main.post(() -> {
                    if (!gate.accepts(generation) || !mayWork()) return;
                    finishRequest();
                    fail("error", reason);
                });
            } finally {
                if (local != null) local.disconnect();
                synchronized (connectionLock) { if (connection == local) connection = null; }
            }
        });
    }

    private void complete(long generation, WeatherPolicy.Cell cell, JSONObject weather) {
        if (!gate.accepts(generation) || !mayWork() || currentCell == null || !currentCell.key.equals(cell.key)) return;
        finishRequest();
        cachedCell = cell;
        cachedWeather = weather;
        displayedWeather = weather;
        failures = 0;
        nextRetryElapsed = 0;
        status = "ready";
        error = null;
        saveState();
        emit();
        schedule(LOCATION_CHECK_MS);
    }

    static JSONObject parseWeather(String body, long now) throws JSONException {
        JSONObject current = new JSONObject(body).getJSONObject("current");
        // Strict raw-number checks avoid JSONObject's string coercion and fractional truncation.
        long observed = (long) strictNumber(current, "time", 1, now / 1000L + 300, true) * 1000L;
        if (!WeatherPolicy.observationUsable(observed, now)) throw new JSONException("invalid observation time");
        int weatherCode = (int) strictNumber(current, "weather_code", 0, 99, true);
        int isDay = (int) strictNumber(current, "is_day", 0, 1, true);
        int interval = (int) strictNumber(current, "interval", 1, 3600, true);
        if (!WeatherPolicy.validWeatherCode(weatherCode) || (isDay != 0 && isDay != 1) || interval <= 0 || interval > 3600)
            throw new JSONException("invalid weather fields");
        JSONObject data = new JSONObject();
        data.put("weatherCode", weatherCode).put("isDay", isDay == 1).put("observedAt", observed).put("fetchedAt", now)
                .put("intervalSeconds", interval);
        data.put("precipitation", finiteRange(current, "precipitation", 0, 1000));
        data.put("windSpeed", finiteRange(current, "wind_speed_10m", 0, 500));
        data.put("windDirection", finiteRange(current, "wind_direction_10m", 0, 360));
        data.put("windGusts", finiteRange(current, "wind_gusts_10m", 0, 500));
        return data;
    }

    private static double finiteRange(JSONObject object, String key, double min, double max) throws JSONException {
        return strictNumber(object, key, min, max, false);
    }

    private static double strictNumber(JSONObject object, String key, double min, double max, boolean integer) throws JSONException {
        try { return WeatherPolicy.strictNumber(object.opt(key), min, max, integer); }
        catch (IllegalArgumentException invalid) { throw new JSONException("invalid numeric field"); }
    }

    private void fail(String nextStatus, String reason) {
        if (!gate.active() || destroyed) return;
        failures = Math.min(failures + 1, 20);
        nextRetryElapsed = SystemClock.elapsedRealtime() + WeatherPolicy.backoff(failures);
        status = nextStatus;
        error = reason;
        emit();
        schedule(Math.max(WeatherPolicy.MIN_FETCH_MS, WeatherPolicy.backoff(failures)));
    }

    private void schedule(long delay) {
        main.removeCallbacks(tick);
        if (gate.active() && !destroyed) main.postDelayed(tick, Math.max(1000, delay));
    }

    private void stopLocation() {
        if (locationListener != null || locationTimeout != null) gate.advance();
        if (locationTimeout != null) main.removeCallbacks(locationTimeout);
        locationTimeout = null;
        if (locationListener != null && locations != null) {
            try { locations.removeUpdates(locationListener); } catch (RuntimeException ignored) { }
        }
        locationListener = null;
    }

    private void finishRequest() {
        if (httpTimeout != null) main.removeCallbacks(httpTimeout);
        httpTimeout = null;
        request = null;
    }

    private void cancelRequest() {
        gate.advance(); // Any already queued successful result is now obsolete.
        if (request != null) request.cancel(true);
        finishRequest();
        synchronized (connectionLock) {
            if (connection != null) connection.disconnect();
            connection = null;
        }
    }

    private void stopWork() {
        main.removeCallbacks(tick);
        stopLocation();
        cancelRequest();
    }

    private void emit() {
        if (destroyed) return;
        long now = System.currentTimeMillis();
        try {
            JSONObject state = new JSONObject();
            boolean stale = displayedWeather == null || !WeatherPolicy.cacheFresh(displayedWeather.optLong("fetchedAt"),
                    displayedWeather.optLong("observedAt"), now) || !("ready".equals(status) || "loading".equals(status) || "locating".equals(status));
            if (displayedWeather != null && !WeatherPolicy.cacheUsable(displayedWeather.optLong("fetchedAt"),
                    displayedWeather.optLong("observedAt"), now)) displayedWeather = null;
            state.put("enabled", gate.enabled).put("consented", gate.enabled).put("status", status)
                    .put("revision", ++revision).put("emittedAt", now).put("stale", stale).put("error", error == null ? JSONObject.NULL : error)
                    .put("source", "Open-Meteo");
            String[] fields = {"weatherCode", "isDay", "precipitation", "windSpeed", "windDirection", "windGusts", "intervalSeconds"};
            for (String field : fields) state.put(field, displayedWeather == null ? JSONObject.NULL : displayedWeather.opt(field));
            state.put("observedAt", displayedWeather == null ? 0 : displayedWeather.optLong("observedAt"));
            state.put("fetchedAt", displayedWeather == null ? 0 : displayedWeather.optLong("fetchedAt"));
            snapshot = state.toString();
            // Evaluate immediately on the UI thread; do not queue old snapshots behind a disable.
            if (webView != null) webView.evaluateJavascript("window.__nativeWeatherState=" + snapshot
                    + ";if(typeof window.onNativeWeather==='function')window.onNativeWeather(window.__nativeWeatherState);", null);
        } catch (JSONException | RuntimeException ignored) { /* Local page may be reloading. */ }
    }

    private void loadSavedState() {
        try {
            byte[] bytes = storage.readFully();
            if (bytes.length > MAX_RESPONSE_BYTES) return;
            JSONObject saved = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            gate.setEnabled(saved.optBoolean("enabled", false) && saved.optInt("consentVersion", 0) == CONSENT_VERSION);
            if (!gate.enabled) return;
            JSONObject weather = saved.optJSONObject("weather");
            if (weather != null && WeatherPolicy.cacheUsable(weather.optLong("fetchedAt"), weather.optLong("observedAt"), System.currentTimeMillis())) {
                cachedCell = WeatherPolicy.cellFromIndices(saved.getInt("row"), saved.getInt("column"));
                cachedWeather = weather;
            }
            status = "paused";
        } catch (Exception ignored) { /* Missing/invalid storage defaults to off or an empty cache. */ }
    }

    private void saveState() {
        FileOutputStream output = null;
        try {
            JSONObject saved = new JSONObject().put("enabled", gate.enabled).put("consentVersion", gate.enabled ? CONSENT_VERSION : 0);
            if (gate.enabled && cachedCell != null && cachedWeather != null) {
                saved.put("row", cachedCell.row).put("column", cachedCell.column).put("weather", cachedWeather);
            }
            output = storage.startWrite();
            output.write(saved.toString().getBytes(StandardCharsets.UTF_8));
            storage.finishWrite(output);
        } catch (Exception ignored) {
            if (output != null) storage.failWrite(output);
            // Do not permit a previously enabled state to resurrect after an unsuccessful disable write.
            if (!gate.enabled) storage.delete();
        }
    }
}

/** Pure policy shared with offline JVM tests; it performs no Android, filesystem, location or network work. */
final class WeatherPolicy {
    static final long CACHE_TTL_MS = 15 * 60_000L;
    static final long MAX_CACHE_MS = 2 * 60 * 60_000L;
    static final long MIN_FETCH_MS = 2 * 60_000L;
    static final double EARTH_METERS = 6_371_008.8;
    static final int ROWS = (int) Math.ceil(Math.PI * EARTH_METERS / 5000.0);

    static final class Cell {
        final int row;
        final int column;
        final double latitude;
        final double longitude;
        final String key;
        Cell(int row, int column, double latitude, double longitude) {
            this.row = row; this.column = column; this.latitude = latitude; this.longitude = longitude;
            this.key = row + ":" + column;
        }
    }

    static boolean validCoordinates(double latitude, double longitude) {
        return Double.isFinite(latitude) && Double.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }

    static Cell coarsen(double latitude, double longitude) {
        if (!validCoordinates(latitude, longitude)) throw new IllegalArgumentException("invalid location");
        int row = Math.min(ROWS - 1, (int) Math.floor((latitude + 90) / 180 * ROWS));
        double center = -90 + (row + .5) * 180 / ROWS;
        int columns = columnsAt(center);
        double wrapped = longitude == 180 ? -180 : longitude;
        int column = Math.min(columns - 1, (int) Math.floor((wrapped + 180) / 360 * columns));
        return cellFromIndices(row, column);
    }

    private static int columnsAt(double latitude) {
        return Math.max(1, (int) Math.round(2 * Math.PI * EARTH_METERS * Math.cos(Math.toRadians(latitude)) / 5000));
    }

    static Cell cellFromIndices(int row, int column) {
        if (row < 0 || row >= ROWS) throw new IllegalArgumentException("invalid cell");
        double latitude = -90 + (row + .5) * 180 / ROWS;
        int columns = columnsAt(latitude);
        if (column < 0 || column >= columns) throw new IllegalArgumentException("invalid cell");
        return new Cell(row, column, latitude, -180 + (column + .5) * 360 / columns);
    }

    static String requestUrl(Cell cell) {
        return String.format(Locale.US, "https://api.open-meteo.com/v1/forecast?latitude=%.6f&longitude=%.6f", cell.latitude, cell.longitude)
                + "&current=weather_code,is_day,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
                + "&wind_speed_unit=kmh&precipitation_unit=mm&timeformat=unixtime&timezone=auto";
    }

    static boolean observationUsable(long observedAt, long now) {
        return observedAt > 0 && observedAt <= now + 5 * 60_000L && now - observedAt <= MAX_CACHE_MS;
    }

    static boolean cacheUsable(long fetchedAt, long observedAt, long now) {
        return fetchedAt > 0 && fetchedAt <= now && now - fetchedAt <= MAX_CACHE_MS && observationUsable(observedAt, now);
    }

    static boolean cacheFresh(long fetchedAt, long observedAt, long now) {
        return cacheUsable(fetchedAt, observedAt, now) && now - fetchedAt < CACHE_TTL_MS && now - observedAt <= 30 * 60_000L;
    }

    static long backoff(int failures) {
        return Math.min(30 * 60_000L, 60_000L * (1L << Math.min(5, Math.max(0, failures - 1))));
    }

    static long waitForAttempt(long elapsed, long lastAttempt, long retryAt) {
        return Math.max(0, Math.max(retryAt - elapsed, lastAttempt < 0 ? 0 : MIN_FETCH_MS - (elapsed - lastAttempt)));
    }

    static double strictNumber(Object raw, double min, double max, boolean integer) {
        if (!(raw instanceof Number)) throw new IllegalArgumentException("number required");
        double value = ((Number) raw).doubleValue();
        if (!Double.isFinite(value) || value < min || value > max || (integer && value != Math.rint(value)))
            throw new IllegalArgumentException("invalid numeric field");
        return value;
    }

    static boolean validWeatherCode(int code) {
        return code == 0 || code == 1 || code == 2 || code == 3 || code == 45 || code == 48
                || code == 51 || code == 53 || code == 55 || code == 56 || code == 57
                || code == 61 || code == 63 || code == 65 || code == 66 || code == 67
                || code == 71 || code == 73 || code == 75 || code == 77 || code == 80 || code == 81 || code == 82
                || code == 85 || code == 86 || code == 95 || code == 96 || code == 97 || code == 99;
    }

    static final class Gate {
        volatile boolean enabled;
        volatile boolean foreground;
        volatile boolean permission;
        private long generation;
        synchronized long advance() { return ++generation; }
        synchronized long generation() { return generation; }
        boolean active() { return enabled && foreground && permission; }
        synchronized boolean accepts(long token) { return token == generation && active(); }
        synchronized void setEnabled(boolean value) { if (enabled != value) { enabled = value; advance(); } }
        synchronized void setForeground(boolean value) { if (foreground != value) { foreground = value; advance(); } }
        synchronized void setPermission(boolean value) { if (permission != value) { permission = value; advance(); } }
    }
}
