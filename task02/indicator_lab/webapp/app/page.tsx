import type { Metadata } from "next";
import IndicatorLab from "./IndicatorLab";

export const metadata: Metadata = {
  title: "Indicator Lab｜多股票技术指标实验室",
  description: "选择股票或上传 CSV，调节 RSI、MACD、布林带与 ATR 参数并即时重绘。",
};

export default function Home() {
  return <IndicatorLab />;
}
