const weatherService = require("./weatherService");

async function testReverseGeocoding() {
  console.log("====================================================================");
  console.log("TESTING REVERSE GEOCODING & ACCURACY ACROSS TEST COORDINATES");
  console.log("====================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  const testCases = [
    {
      name: "Perungudi / OMR (Chennai Suburb)",
      lat: 12.9698,
      lon: 80.2450
    },
    {
      name: "Electronic City (Bengaluru Tech Corridor)",
      lat: 12.8452,
      lon: 77.6602
    },
    {
      name: "Vashi / Navi Mumbai",
      lat: 19.0770,
      lon: 72.9986
    },
    {
      name: "Tirumangalam (Town near Madurai)",
      lat: 9.8820,
      lon: 77.9500
    }
  ];

  for (const tc of testCases) {
    console.log(`\n--- Testing: ${tc.name} (${tc.lat}, ${tc.lon}) ---`);
    try {
      const geo = await weatherService.reverseGeocode(tc.lat, tc.lon);
      assert(geo && geo.name, `Resolved name: "${geo?.name}", Display: "${geo?.displayName}"`);
      assert(geo.latitude === tc.lat && geo.longitude === tc.lon, `Preserved exact GPS coordinates: (${geo?.latitude}, ${geo?.longitude})`);

      const currentWeather = await weatherService.fetchCurrentWeatherData(geo);
      assert(currentWeather && typeof currentWeather.temperature === "number",
        `Current Temp: ${currentWeather.temperature}°C, Condition: ${currentWeather.condition}`);

      const forecastWeather = await weatherService.fetchForecastWeatherData(geo, 3);
      assert(forecastWeather && forecastWeather.forecast?.length === 3,
        `Forecast returned 3 days: Day 1: ${forecastWeather.forecast[0]?.maxTemp}°C / ${forecastWeather.forecast[0]?.minTemp}°C`);
    } catch (err) {
      assert(false, `Test failed for ${tc.name}: ${err.message}`);
    }
  }

  console.log("\n====================================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

testReverseGeocoding().catch(err => {
  console.error("Reverse geocoding test failed:", err);
  process.exit(1);
});
