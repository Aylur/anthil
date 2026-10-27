import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: [],
    includeSource: ["src/**/*.{ts,tsx}"],
  },
})
