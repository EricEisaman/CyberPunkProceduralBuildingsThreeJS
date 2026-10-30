import { createRoot } from "react-dom/client";
import "@fontsource/noto-sans-jp/700.css";
import "@fontsource/noto-sans-jp/900.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/700.css";
import "./ui/styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
