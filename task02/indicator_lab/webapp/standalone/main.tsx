import React from "react";
import { createRoot } from "react-dom/client";
import IndicatorLab from "../app/IndicatorLab";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("页面缺少 root 容器");
createRoot(root).render(
  <React.StrictMode>
    <IndicatorLab />
  </React.StrictMode>,
);
