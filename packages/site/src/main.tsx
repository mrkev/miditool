import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

// Follow the system color scheme
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const syncDark = () =>
  document.documentElement.classList.toggle("dark", darkQuery.matches);
syncDark();
darkQuery.addEventListener("change", syncDark);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
