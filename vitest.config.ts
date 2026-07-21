import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // "@/..." 경로 별칭을 tsconfig에서 그대로 해석
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // Playwright e2e는 별도 러너(test:e2e)로 실행하므로 vitest 대상에서 제외
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
