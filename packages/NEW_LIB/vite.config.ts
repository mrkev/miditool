import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vite.dev/config/
export default defineConfig({
  logLevel: "info",
  plugins: [dts({ tsconfigPath: "./tsconfig.app.json" })],
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    minify: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "miditool",
      // the proper extensions will be added. Must match "main"/"module" in package.json
      fileName: "miditool",
    },
    rolldownOptions: {
      // make sure to externalize deps that shouldn't be bundled nto your library
      external: ["react", "react-dom"],
      output: {
        // Provide global variables to use in the UMD build for externalized deps
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
  },
});
