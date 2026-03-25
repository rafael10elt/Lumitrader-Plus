"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

const INTERVAL_MAP: Record<string, string> = {
  M1: "1",
  M5: "5",
  M15: "15",
  M30: "30",
  H1: "60",
  H4: "240",
  D1: "1D",
};

function resolveTradingViewSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase();

  if (normalized.includes(":")) {
    return normalized;
  }

  if (["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"].includes(normalized)) {
    return `OANDA:${normalized}`;
  }

  if (normalized.endsWith("USDT")) {
    return `BINANCE:${normalized}`;
  }

  return `OANDA:${normalized}`;
}

export function TradingViewChart({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const id = useId().replace(/:/g, "");
  const containerId = `tv-chart-${id}`;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    const renderWidget = () => {
      if (!window.TradingView || !container) {
        return;
      }

      container.innerHTML = `<div id="${containerId}" style="height:100%;width:100%"></div>`;

      new window.TradingView.widget({
        autosize: true,
        symbol: resolveTradingViewSymbol(symbol),
        interval: INTERVAL_MAP[timeframe] ?? "5",
        timezone: "America/Sao_Paulo",
        theme: "dark",
        style: "1",
        locale: "br",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        allow_symbol_change: false,
        withdateranges: true,
        details: true,
        hotlist: false,
        calendar: false,
        studies: ["Volume@tv-basicstudies"],
        support_host: "https://www.tradingview.com",
        container_id: containerId,
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-tradingview-widget="advanced-chart"]');
    if (existingScript) {
      renderWidget();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.dataset.tradingviewWidget = "advanced-chart";
    script.onload = renderWidget;
    document.body.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [containerId, symbol, timeframe]);

  return <div ref={containerRef} className="mt-5 h-[430px] overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/60" />;
}
