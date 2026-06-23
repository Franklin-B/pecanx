import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    // The browser calls /api/... ; Vite forwards that to the Express
    // server so there's no CORS and the front end uses a relative URL.
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
