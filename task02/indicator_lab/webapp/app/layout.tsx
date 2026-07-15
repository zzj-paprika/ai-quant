import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Indicator Lab｜多股票技术指标实验室",
  description: "可解释、可调参的 RSI、MACD、布林带与 ATR 研究工具。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
