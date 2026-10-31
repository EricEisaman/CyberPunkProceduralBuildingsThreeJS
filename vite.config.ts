import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: '/CyberPunkProceduralBuildingsThreeJS/',
  plugins: [react()],
  server: { port: 5190 },
});