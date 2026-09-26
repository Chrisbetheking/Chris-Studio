import type { IntentReport, SkillContext } from "../types";

type GeoItem = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
};

type WeatherNow = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    wind_speed_10m?: number;
  };
};

export async function collectWeatherContext(intent: IntentReport): Promise<SkillContext | null> {
  if (intent.intent !== "weather") return null;
  const location = intent.entities.location || fallbackLocation(intent.query);

  if (!location) {
    return {
      name: "weather",
      status: "skipped",
      title: "Weather skill skipped",
      content: "No location was found in the user request. Ask for a city before giving current weather.",
      directAnswer: intent.language === "zh" ? "我需要一个城市名才能查实时天气。" : "I need a city name to check live weather."
    };
  }

  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl, { cache: "no-store" });
    if (!geoRes.ok) throw new Error(`geocoding ${geoRes.status}`);
    const geoJson = await geoRes.json() as { results?: GeoItem[] };
    const place = geoJson.results?.[0];
    if (!place) throw new Error("location not found");

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m&timezone=auto`;
    const weatherRes = await fetch(weatherUrl, { cache: "no-store" });
    if (!weatherRes.ok) throw new Error(`weather ${weatherRes.status}`);
    const weather = await weatherRes.json() as WeatherNow;
    const current = weather.current || {};
    const label = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
    const humidity = value(current.relative_humidity_2m, "%");
    const temp = value(current.temperature_2m, "°C");
    const feels = value(current.apparent_temperature, "°C");
    const wind = value(current.wind_speed_10m, "km/h");
    const rain = value(current.precipitation, "mm");

    const content = [
      `Live weather lookup from Open-Meteo`,
      `Location: ${label}`,
      `Time: ${current.time || "unknown"}`,
      `Temperature: ${temp}`,
      `Apparent temperature: ${feels}`,
      `Relative humidity: ${humidity}`,
      `Precipitation: ${rain}`,
      `Wind speed: ${wind}`,
      `Instruction: answer the user's weather question from this live context. If the user asks humidity, give the humidity first.`
    ].join("\n");

    const directAnswer = intent.language === "zh"
      ? `${label} 当前相对湿度约为 ${humidity}，气温 ${temp}，体感 ${feels}。`
      : `Current relative humidity in ${label} is about ${humidity}, with temperature ${temp} and apparent temperature ${feels}.`;

    return {
      name: "weather",
      status: "ok",
      title: "Live weather context",
      content,
      source: "Open-Meteo",
      directAnswer
    };
  } catch (error) {
    return {
      name: "weather",
      status: "error",
      title: "Weather skill failed",
      content: `Weather lookup failed for "${location}". Error: ${error instanceof Error ? error.message : "unknown"}. Tell the user live weather could not be collected, rather than guessing.`,
      source: "Open-Meteo",
      directAnswer: intent.language === "zh" ? `我没能查到 ${location} 的实时天气，不能直接猜湿度。` : `I could not fetch live weather for ${location}, so I should not guess the humidity.`
    };
  }
}

function fallbackLocation(query: string) {
  if (/吉隆坡|kuala lumpur|\bkl\b/i.test(query)) return "Kuala Lumpur";
  return "";
}

function value(input: number | undefined, unit: string) {
  if (typeof input !== "number" || Number.isNaN(input)) return "unknown";
  return `${Math.round(input * 10) / 10}${unit}`;
}
