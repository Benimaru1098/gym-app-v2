import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from "@capacitor/core";

export const isNativeAndroid = Capacitor.getPlatform() === "android";
export const gymCycleAndroid = registerPlugin("GymCycleAndroid");

export function syncAndroidSystemBars(theme) {
  if (!isNativeAndroid) return;

  SystemBars.setStyle({ style: theme === "light" ? SystemBarsStyle.Light : SystemBarsStyle.Dark })
    .catch((error) => console.warn("Could not update Android system bars", error));
}
