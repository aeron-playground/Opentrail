import { formatExactTime, formatPrice } from "@repo/format";
import { plainDecimal } from "@repo/pnl";
import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  TickMarkType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export type ChartPoint = { start: string; price: string };
export type ChartDirection = "up" | "down" | "flat";

// Loaded only with the token page: the chart library is the page's largest piece.
export function PriceChart({
  points,
  direction,
  intraday,
}: {
  points: readonly ChartPoint[];
  // Green for a rise and red for a fall, like every other gain and loss.
  direction: ChartDirection;
  // Whether the time axis shows hours, for ranges of a day or a week.
  intraday: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const chart = createChart(container, {
      autoSize: true,
      // A price chart to read, not a trading terminal: no dragging or zooming.
      handleScroll: false,
      handleScale: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        fontFamily: getComputedStyle(container).fontFamily,
        // The credit line under the chart links to TradingView instead.
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter },
      // The library shows UTC unless told otherwise; people read their own time.
      localization: { timeFormatter: (time: Time) => formatExactTime(dateOf(time)) },
    });
    seriesRef.current = chart.addSeries(LineSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "custom", minMove: 1e-12, formatter: axisPrice },
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // The canvas can't use CSS classes, so it reads the color tokens, and reads them again when the
  // theme or the gain and loss colors change.
  useEffect(() => {
    const paint = () => {
      const ink3 = cssToken("--ink-3");
      const crosshairLine = { color: ink3, labelBackgroundColor: cssToken("--ink") };
      chartRef.current?.applyOptions({
        layout: { textColor: ink3 },
        grid: { horzLines: { color: cssToken("--line") } },
        crosshair: { vertLine: crosshairLine, horzLine: crosshairLine },
      });
      seriesRef.current?.applyOptions({ color: cssToken(LINE_COLOR[direction]) });
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [direction]);

  useEffect(() => {
    // Numbers only to place points on the drawing; every label comes from the price strings.
    seriesRef.current?.setData(
      points.map((point) => ({
        time: (Date.parse(point.start) / 1000) as UTCTimestamp,
        value: Number(point.price),
      })),
    );
    chartRef.current?.applyOptions({ timeScale: { timeVisible: intraday } });
    chartRef.current?.timeScale().fitContent();
  }, [points, intraday]);

  return <div ref={containerRef} className="h-60 w-full sm:h-72" />;
}

const LINE_COLOR: Record<ChartDirection, string> = {
  up: "--gain",
  down: "--loss",
  flat: "--ink-3",
};

const cssToken = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const dateOf = (time: Time) => new Date((time as UTCTimestamp) * 1000);

// The axis may place a tick below zero for a tiny price; there's no price to show there.
function axisPrice(price: number): string {
  return price < 0 ? "" : formatPrice(plainDecimal(String(price)));
}

function tickMarkFormatter(time: Time, type: TickMarkType): string {
  const options: Intl.DateTimeFormatOptions =
    type === TickMarkType.Year
      ? { year: "numeric" }
      : type === TickMarkType.Month
        ? { month: "short" }
        : type === TickMarkType.DayOfMonth
          ? { month: "short", day: "numeric" }
          : { hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat(undefined, options).format(dateOf(time));
}
