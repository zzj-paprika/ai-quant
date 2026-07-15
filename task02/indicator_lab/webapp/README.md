# Indicator Lab 网页应用

基于 `../PRODUCT_DESIGN.md` 实现的多股票技术指标实验室。

## 已实现

- 博杰股份（前复权）、比亚迪、长江电力、中芯国际内置数据切换
- 自定义 CSV 上传
- 红涨绿跌日 K 线及共享悬停日期
- RSI、MACD、布林带、ATR 参数调节与即时重绘
- 单指标和多指标模式
- 指标原理、数值读法和使用限制
- 四指标最新值汇总及联合解读
- 参数保存在浏览器本地
- 桌面端与移动端响应式布局

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

打开终端显示的本地地址，默认通常为 `http://localhost:3000`。

## 构建与测试

```bash
npm run build
npm test
```

## 上传 CSV 字段

必需字段：

```text
trade_date,open,high,low,close
```

建议字段：

```text
ts_code,pre_close,vol,adjustment,source
```

日期支持 `YYYYMMDD`、`YYYY-MM-DD` 或 `YYYY/MM/DD`。上传文件的复权口径无法识别时，页面会显示“口径未知”，不会自行猜测。

## 说明

应用仅用于技术指标学习和研究，不构成投资建议。内置数据是本地快照，不会自动刷新。
