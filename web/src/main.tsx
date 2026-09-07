import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/App";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/toast";
import "./index.css";

/** Follow the OS colour scheme; there is no in-app theme switch to persist. */
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = (matches: boolean) =>
  document.documentElement.classList.toggle("dark", matches);
applyTheme(dark.matches);
dark.addEventListener("change", (e) => applyTheme(e.matches));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
