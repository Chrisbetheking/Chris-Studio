import type { IntentReport, SkillContext } from "../types";
import { collectWeatherContext } from "./weather";

export async function collectSkillContexts(intent: IntentReport): Promise<SkillContext[]> {
  const contexts: SkillContext[] = [];
  const weather = await collectWeatherContext(intent);
  if (weather) contexts.push(weather);
  return contexts;
}
