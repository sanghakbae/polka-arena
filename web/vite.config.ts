import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    // Reachable from a phone on the same network, which is how the mobile
    // layout actually gets tested.
    host: true,
  },
})
