package com.show.p7;

import java.util.Random;

/** JVM-only, synthetic coordinates. No Android instance, device, permission or network is used. */
public final class WeatherPolicyTest {
    private static int checks;
    private static void check(boolean okay, String message) {
        checks++;
        if (!okay) throw new AssertionError(message);
    }
    private static double distance(double lat1, double lon1, double lat2, double lon2) {
        double a = Math.pow(Math.sin(Math.toRadians(lat2 - lat1) / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.pow(Math.sin(Math.toRadians(lon2 - lon1) / 2), 2);
        return 2 * WeatherPolicy.EARTH_METERS * Math.asin(Math.sqrt(Math.min(1, a)));
    }
    private static void invalid(double lat, double lon) {
        try { WeatherPolicy.coarsen(lat, lon); throw new AssertionError("accepted invalid coordinate"); }
        catch (IllegalArgumentException expected) { checks++; }
    }
    private static void invalidNumber(Object raw, double min, double max, boolean integer) {
        try { WeatherPolicy.strictNumber(raw, min, max, integer); throw new AssertionError("accepted malformed numeric field"); }
        catch (IllegalArgumentException expected) { checks++; }
    }
    public static void main(String[] args) {
        Random random = new Random(77);
        for (int i = 0; i < 10_000; i++) {
            double latitude = random.nextDouble() * 180 - 90;
            double longitude = random.nextDouble() * 360 - 180;
            WeatherPolicy.Cell cell = WeatherPolicy.coarsen(latitude, longitude);
            check(WeatherPolicy.validCoordinates(cell.latitude, cell.longitude), "cell range");
            check(distance(latitude, longitude, cell.latitude, cell.longitude) < 3900, "approximately 5 km grid");
            check(cell.key.equals(WeatherPolicy.coarsen(cell.latitude, cell.longitude).key), "stable center");
            check(cell.key.equals(WeatherPolicy.cellFromIndices(cell.row, cell.column).key), "cache cell round-trip");
        }
        check(WeatherPolicy.coarsen(0, 180).key.equals(WeatherPolicy.coarsen(0, -180).key), "antimeridian");
        check(WeatherPolicy.coarsen(90, 0).latitude < 90, "north pole");
        check(WeatherPolicy.coarsen(-90, 0).latitude > -90, "south pole");
        WeatherPolicy.Cell near = WeatherPolicy.coarsen(30, 120);
        WeatherPolicy.Cell high = WeatherPolicy.coarsen(75, 120);
        check(distance(near.latitude, near.longitude, near.latitude, WeatherPolicy.cellFromIndices(near.row, near.column + 1).longitude) > 4900, "low-latitude cell width");
        check(distance(high.latitude, high.longitude, high.latitude, WeatherPolicy.cellFromIndices(high.row, high.column + 1).longitude) > 4900, "longitude accounts for latitude");
        invalid(Double.NaN, 0); invalid(0, Double.POSITIVE_INFINITY); invalid(91, 0); invalid(0, 181);
        String url = WeatherPolicy.requestUrl(near);
        check(url.startsWith("https://api.open-meteo.com/v1/forecast?"), "fixed HTTPS recipient");
        check(url.contains("&timezone=auto") && url.contains("&timeformat=unixtime"), "UTC epoch timestamps");
        check(url.contains("&wind_speed_unit=kmh") && url.contains("&precipitation_unit=mm"), "explicit units");
        check(url.contains(String.format(java.util.Locale.US, "latitude=%.6f&longitude=%.6f", near.latitude, near.longitude)), "only coarse cell in request");
        check(!WeatherPolicy.coarsen(30.123456, 120.123456).key.equals(near.key), "5 km movement changes cell");

        long now = 1_800_000_000_000L;
        check(WeatherPolicy.cacheFresh(now - 1000, now - 900_000, now), "fresh cache");
        check(!WeatherPolicy.cacheFresh(now - WeatherPolicy.CACHE_TTL_MS, now, now), "15 minute boundary");
        check(!WeatherPolicy.cacheFresh(now - 1000, now - 1_800_001, now), "fresh fetch cannot rejuvenate old observation");
        check(WeatherPolicy.cacheUsable(now - 3_600_000, now - 3_600_000, now), "stale data retained briefly");
        check(!WeatherPolicy.cacheUsable(now - WeatherPolicy.MAX_CACHE_MS - 1, now, now), "expired cache");
        check(!WeatherPolicy.cacheUsable(now + 1, now, now), "clock rollback invalidates cache");
        check(!WeatherPolicy.cacheUsable(now, now + 300_001, now), "future observation invalid");
        check(!WeatherPolicy.observationUsable(0, now), "missing observation invalid");
        check(WeatherPolicy.backoff(1) == 60_000 && WeatherPolicy.backoff(2) == 120_000, "exponential retry");
        check(WeatherPolicy.backoff(3) == 240_000 && WeatherPolicy.backoff(20) == 1_800_000, "bounded backoff");
        check(WeatherPolicy.waitForAttempt(100_000, -1, 0) == 0, "first fetch allowed");
        check(WeatherPolicy.waitForAttempt(100_000, 90_000, 0) == 110_000, "movement rate limited");
        check(WeatherPolicy.waitForAttempt(100_000, 90_000, 500_000) == 400_000, "backoff stronger than movement");
        check(WeatherPolicy.waitForAttempt(500_000, 90_000, 500_000) == 0, "retry boundary");
        check(WeatherPolicy.validWeatherCode(95) && WeatherPolicy.validWeatherCode(97) && WeatherPolicy.validWeatherCode(99), "thunderstorm codes");
        check(!WeatherPolicy.validWeatherCode(-1) && !WeatherPolicy.validWeatherCode(4), "unknown codes rejected");

        // Malformed API-value fixtures exercise the production validation used by parseWeather.
        invalidNumber("95", 0, 99, true); invalidNumber(0.9, 0, 99, true);
        invalidNumber(0.5, 0, 1, true); invalidNumber(true, 0, 1, true);
        invalidNumber(null, 0, 500, false); invalidNumber(Double.NaN, 0, 500, false);
        invalidNumber(Double.POSITIVE_INFINITY, 0, 500, false); invalidNumber(-0.1, 0, 1000, false);
        invalidNumber(Long.MAX_VALUE, 1, now / 1000 + 300, true);
        invalidNumber("1800000000", 1, now / 1000 + 300, true);
        invalidNumber(900.5, 1, 3600, true);
        check(WeatherPolicy.strictNumber(95, 0, 99, true) == 95, "valid WMO integer");
        check(WeatherPolicy.strictNumber(1, 0, 1, true) == 1, "valid day flag");
        check(WeatherPolicy.strictNumber(1.25, 0, 1000, false) == 1.25, "fractional precipitation retained");
        check(WeatherPolicy.strictNumber(1_800_000_000L, 1, now / 1000 + 300, true) * 1000 == now, "epoch UTC without offset");

        WeatherPolicy.Gate gate = new WeatherPolicy.Gate();
        check(!gate.active(), "default off");
        gate.setForeground(true); gate.setPermission(true);
        check(!gate.active(), "permission never implies consent");
        gate.setEnabled(true);
        long first = gate.advance();
        check(gate.accepts(first), "consented foreground response accepted");
        long second = gate.advance();
        check(!gate.accepts(first) && gate.accepts(second), "old request cannot overwrite new response");
        gate.setForeground(false);
        check(!gate.active() && !gate.accepts(second), "background cancels queued result");
        gate.setForeground(true);
        check(!gate.accepts(second), "resume cannot revive old request");
        long third = gate.advance();
        gate.setPermission(false);
        check(!gate.active() && !gate.accepts(third), "revocation blocks transmission/results");
        gate.setPermission(true);
        check(!gate.accepts(third), "regrant cannot revive queued result");
        long fourth = gate.advance();
        gate.setEnabled(false);
        check(!gate.accepts(fourth), "disable invalidates request");
        gate.setEnabled(true);
        check(!gate.accepts(fourth), "reenable cannot revive disabled request");
        System.out.println("WeatherPolicy: " + checks + " checks passed (offline)");
    }
}
