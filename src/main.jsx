import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { getStoredLanguage, i18n } from "./i18n/index.js";
import { gymCycleAndroid, isNativeAndroid, syncAndroidSystemBars } from "./platform/android.js";
import { WeightUnitProvider } from "./ui/WeightUnitSettings.jsx";

async function startApp() {
  if (isNativeAndroid) {
    document.documentElement.classList.add("native-android");
    syncAndroidSystemBars(document.documentElement.dataset.theme);

    if (!getStoredLanguage()) {
      try {
        const { language } = await gymCycleAndroid.getSystemLanguage();
        await i18n.changeLanguage(language === "ru" ? "ru" : "en");
      } catch (error) {
        console.warn("Could not read the Android system language", error);
      }
    }
  }

  createRoot(document.getElementById("root")).render(
    <WeightUnitProvider>
      <App />
    </WeightUnitProvider>,
  );
}

startApp();
