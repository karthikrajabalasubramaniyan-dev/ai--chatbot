const weatherService = require("./weatherService");

async function runOpenMeteoTests() {
  console.log("====================================================================");
  console.log("TESTING OPEN-METEO WEATHER DATA FALLBACK IN WEATHERGPT");
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

  const testCities = ["Chennai", "Delhi", "Bengaluru", "London", "Tokyo"];

  console.log("\n--- TEST 1: Current Weather via Open-Meteo ---");
  for (const city of testCities) {
    try {
      const geo = await weatherService.geocodeLocation(city);
      assert(geo && geo.latitude && geo.longitude, `Geocoded "${city}" -> (${geo?.latitude}, ${geo?.longitude})`);

      const current = await weatherService.fetchCurrentWeatherData(geo);
      assert(current && typeof current.temperature === "number", `Current weather returned for ${city}: ${current.temperature}°C`);
      assert(typeof current.feelsLike === "number", `feelsLike exists: ${current.feelsLike}°C`);
      assert(typeof current.condition === "string" && current.condition.length > 0, `Condition: "${current.condition}"`);
      assert(typeof current.humidity === "number" && current.humidity >= 0 && current.humidity <= 100, `Humidity valid: ${current.humidity}%`);
      assert(typeof current.windSpeed === "number" && current.windSpeed >= 0, `Wind speed valid: ${current.windSpeed} km/h`);
      assert(current.today && typeof current.today.maxTemp === "number" && typeof current.today.minTemp === "number",
        `Today high/low: ${current.today.maxTemp}°C / ${current.today.minTemp}°C`);
      assert(current.tomorrow && typeof current.tomorrow.maxTemp === "number",
        `Tomorrow high: ${current.tomorrow.maxTemp}°C`);
    } catch (err) {
      assert(false, `Current weather failed for ${city}: ${err.message}`);
    }
  }

  console.log("\n--- TEST 2: Multi-Day Forecast (5 & 7 Days) via Open-Meteo ---");
  for (const days of [5, 7]) {
    try {
      const geo = await weatherService.geocodeLocation("Chennai");
      const forecast = await weatherService.fetchForecastWeatherData(geo, days);
      assert(forecast && Array.isArray(forecast.forecast), `Forecast returned array for ${days} days`);
      assert(forecast.forecast.length >= days, `Forecast contains at least ${days} days (got ${forecast.forecast.length})`);
      
      const firstDay = forecast.forecast[0];
      assert(firstDay && firstDay.date && typeof firstDay.maxTemp === "number" && typeof firstDay.minTemp === "number",
        `Day 1: ${firstDay.dayName} (${firstDay.date}) - ${firstDay.maxTemp}°C / ${firstDay.minTemp}°C, ${firstDay.condition}`);
      assert(typeof firstDay.rainProbability === "number", `Rain probability valid: ${firstDay.rainProbability}%`);
    } catch (err) {
      assert(false, `Forecast failed for ${days} days: ${err.message}`);
    }
  }

  console.log("\n--- TEST 3: Hourly Weather (12 & 24 Hours) via Open-Meteo ---");
  for (const hours of [12, 24]) {
    try {
      const geo = await weatherService.geocodeLocation("Bengaluru");
      const hourly = await weatherService.fetchHourlyWeatherData(geo, hours);
      assert(hourly && Array.isArray(hourly.hourly), `Hourly weather returned array for ${hours} hours`);
      assert(hourly.hourly.length >= Math.min(hours, 12), `Hourly contains records (got ${hourly.hourly.length})`);

      const firstHour = hourly.hourly[0];
      assert(firstHour && typeof firstHour.temperature === "number" && firstHour.time,
        `Hour 1: ${firstHour.hourLabel || firstHour.time} - ${firstHour.temperature}°C, ${firstHour.condition}`);
    } catch (err) {
      assert(false, `Hourly failed for ${hours} hours: ${err.message}`);
    }
  }

  console.log("\n--- TEST 4: Context Prompt Building with Open-Meteo Data ---");
  try {
    const geo = await weatherService.geocodeLocation("Chennai");
    const current = await weatherService.fetchCurrentWeatherData(geo);
    const forecast = await weatherService.fetchForecastWeatherData(geo, 3);
    const hourly = await weatherService.fetchHourlyWeatherData(geo, 6);
    const temporal = { type: "current", description: "current weather" };

    const prompt = weatherService.buildWeatherContextPrompt(current, forecast, hourly, null, temporal);
    assert(typeof prompt === "string" && prompt.includes("CURRENT WEATHER"), "Prompt includes CURRENT WEATHER");
    assert(prompt.includes("FORECAST"), "Prompt includes FORECAST");
    assert(prompt.includes("Hourly Breakdown"), "Prompt includes Hourly Breakdown");
    assert(prompt.includes("INSTRUCTIONS FOR AI ASSISTANT"), "Prompt includes INSTRUCTIONS FOR AI ASSISTANT");
  } catch (err) {
    assert(false, `Context prompt test failed: ${err.message}`);
  }

  console.log("\n====================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runOpenMeteoTests().catch(err => {
  console.error("Open-Meteo test runner error:", err);
  process.exit(1);
});
