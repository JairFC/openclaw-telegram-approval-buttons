import { en } from "./en.js";
import { zhCN } from "./zh-CN.js";

export type SupportedLanguage = "en" | "zh-CN";

export function getLocale(language?: string) {
  if (language === "zh-CN") return zhCN;
  return en;
}
