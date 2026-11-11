import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { WeightUnitProvider } from "./ui/WeightUnitSettings.jsx";

createRoot(document.getElementById("root")).render(
  <WeightUnitProvider>
    <App />
  </WeightUnitProvider>,
);
