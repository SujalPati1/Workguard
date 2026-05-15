import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

import { SessionProvider } from "./context/SessionContext.jsx";
import { LivenessProvider } from "./context/LivenessEngine.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SessionProvider>
      <LivenessProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LivenessProvider>
    </SessionProvider>
  </React.StrictMode>
);
