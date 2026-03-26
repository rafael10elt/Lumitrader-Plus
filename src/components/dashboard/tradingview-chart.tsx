"use client";

import { useEffect, useId, useRef, useState } from "react";

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

export function TradingViewChart({ initialSymbol = "XAUUSD", initialTimeframe = "M5" }: { initialSymbol?: string; initialTimeframe?: string }) {
  const id = useId().replace(/:/g, "");
  const containerId = `tv-chart-${id}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsCompact(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    const renderWidget = () => {
      if (!window.TradingView || !container) {
        return;
      }

      container.innerHTML = `<div id="${containerId}" style="height:100%;width:100%"></div>`;

      new window.TradingView.widget({
        autosize: true,
        symbol: resolveTradingViewSymbol(initialSymbol),
        interval: INTERVAL_MAP[initialTimeframe] ?? "5",
        timezone: "America/Sao_Paulo",
        theme: "dark",
        style: "1",
        locale: "br",
        enable_publishing: false,
        allow_symbol_change: !isCompact,
        withdateranges: !isCompact,
        hide_side_toolbar: isCompact,
        details: !isCompact,
        hotlist: false,
        calendar: false,
        save_image: false,
        studies: ["Volume@tv-basicstudies"],
        container_id: containerId,
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-tradingview-widget=\"tvjs\"]");
    if (existingScript) {
      if ((window.TradingView as { widget?: unknown } | undefined)?.widget) {
        renderWidget();
      } else {
        existingScript.addEventListener("load", renderWidget, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.dataset.tradingviewWidget = "tvjs";
    script.onload = renderWidget;
    document.body.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [containerId, initialSymbol, initialTimeframe, isCompact]);

  return <div ref={containerRef} className="mt-3 h-[390px] min-w-0 flex-1 overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/60 sm:h-[470px] xl:min-h-[560px]" />;
}

