import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { env } from "./env";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("index.html has no #root element.");
}

createRoot(root).render(
  <StrictMode>
    <App env={env} />
  </StrictMode>,
);
