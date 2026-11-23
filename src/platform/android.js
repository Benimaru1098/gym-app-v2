import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from "@capacitor/core";

export const isNativeAndroid = Capacitor.getPlatform() === "android";
export const gymCycleAndroid = registerPlugin("GymCycleAndroid");

export async function syncAndroidSystemBars(theme) {
  if (!isNativeAndroid) return;

  const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  try {
    await SystemBars.setStyle({ style: theme === "light" ? SystemBarsStyle.Light : SystemBarsStyle.Dark });
    if (color) await gymCycleAndroid.setSystemBarsBackground({ color });
  } catch (error) {
    console.warn("Could not update Android system bars", error);
  }
}
