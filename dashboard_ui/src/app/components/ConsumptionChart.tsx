import React, { useState } from "react";
import { BillRecord } from "../types";

interface ConsumptionChartProps {
  history: BillRecord[];
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  selectedYear: string;
}

export default function ConsumptionChart({ history, theme, t, selectedYear }: ConsumptionChartProps) {
  const isDark = theme === "dark";
  const [hoveredPoint, setHoveredPoint] = useState<{ utility: string; month: string; units: number; x: number; y: number } | null>(null);

  // Filter records by selected year and presence of units
  const validRecords = (Array.isArray(history) ? history : []).filter((r) => {
    const matchesYear = selectedYear === "All" || String(r.billing_year) === selectedYear;
    return matchesYear && (r.units_consumed || 0) > 0;
  });

  // Extract unique utility types
  const utilities = Array.from(new Set(validRecords.map((r) => r.utility_type).filter(Boolean))) as string[];

  // Distinct color palette for different utility series
  const utilityColors: Record<string, { stroke: string; fill: string; dot: string }> = {
    Electricity: { stroke: "#3b82f6", fill: "rgba(59, 130, 246, 0.15)", dot: "#60a5fa" },
    Water: { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.15)", dot: "#22d3ee" },
    Gas: { stroke: "#f97316", fill: "rgba(249, 115, 22, 0.15)", dot: "#fb923c" },
    WiFi: { stroke: "#a855f7", fill: "rgba(168, 85, 247, 0.15)", dot: "#c084fc" },
    Default: { stroke: "#6366f1", fill: "rgba(99, 102, 241, 0.15)", dot: "#818cf8" }
  };

  // Get standardized timeline months across records
  const allMonths = Array.from(new Set(validRecords.map(r => `${String(r.billing_month || "").trim()} ${r.billing_year || ""}`)));

  // Maximum unit scale for graph height calculation
  const maxUnits = Math.max(...validRecords.map((r) => r.units_consumed || 0), 100);

  // SVG dimensions
  const svgWidth = Math.max(allMonths.length * 100, 600);
  const svgHeight = 220;
  const paddingBottom = 40;
  const paddingTop = 30;
  const chartHeight = svgHeight - paddingBottom - paddingTop;

  // Map month string to X coordinate
  const getXCoord = (index: number) => {
    if (allMonths.length <= 1) return svgWidth / 2;
    return 50 + (index / (allMonths.length - 1)) * (svgWidth - 100);
  };

  const getYCoord = (units: number) => {
    return paddingTop + chartHeight - (units / maxUnits) * chartHeight;
  };

  return (
    <div
      className={`p-6 rounded-3xl border transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-[#0b0f19] border-slate-800/80 shadow-2xl"
          : "bg-white border-slate-200/80 shadow-xl"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
            <h3 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Advanced Multi-Utility Consumption Trends
            </h3>
          <p className="text-xs text-slate-400 mt-0.5">Comparative timeline analysis separated by utility category</p>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {utilities.map((u) => {
            const color = utilityColors[u] || utilityColors.Default;
            return (
              <div key={u} className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-800/40 border border-slate-700/50 text-[11px] font-semibold text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.stroke }} />
                <span>{u}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chart Canvas Area with aesthetic custom scrollbars */}
      <div className={`overflow-x-auto pt-4 pb-2 relative ${isDark ? "custom-scrollbar-dark" : "custom-scrollbar-light"}`}>
        <style jsx>{`
          .custom-scrollbar-dark::-webkit-scrollbar {
            height: 6px;
          }
          .custom-scrollbar-dark::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.6);
          }
          .custom-scrollbar-dark::-webkit-scrollbar-thumb {
            background: rgba(51, 65, 85, 0.8);
            border-radius: 9999px;
          }
          .custom-scrollbar-light::-webkit-scrollbar {
            height: 6px;
          }
          .custom-scrollbar-light::-webkit-scrollbar-track {
            background: rgba(241, 245, 249, 0.8);
          }
          .custom-scrollbar-light::-webkit-scrollbar-thumb {
            background: rgba(203, 213, 225, 1);
            border-radius: 9999px;
          }
        `}</style>

        {validRecords.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-xs text-slate-500">
            No consumption data recorded for the selected timeline period.
          </div>
        ) : (
          <div className="relative">
            {/* Tooltip positioned safely above elements so it never cuts off */}
            {hoveredPoint && (
              <div
                className="absolute z-30 transform -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-xl bg-slate-950 text-slate-200 text-xs border border-slate-700 shadow-2xl pointer-events-none whitespace-nowrap"
                style={{ left: `${hoveredPoint.x}px`, top: `${hoveredPoint.y - 12}px` }}
              >
                <span className="font-bold text-blue-400">{hoveredPoint.utility}</span>: {hoveredPoint.units} Units ({hoveredPoint.month})
              </div>
            )}

            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-56 overflow-visible">
              <defs>
                {utilities.map((u) => {
                  const color = utilityColors[u] || utilityColors.Default;
                  return (
                    <linearGradient key={u} id={`grad-${u}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color.stroke} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={color.stroke} stopOpacity="0.0" />
                    </linearGradient>
                  );
                })}
              </defs>

              {/* Horizontal Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const y = paddingTop + chartHeight * ratio;
                return (
                  <line
                    key={i}
                    x1="40"
                    y1={y}
                    x2={svgWidth - 40}
                    y2={y}
                    stroke={isDark ? "rgba(51, 65, 85, 0.3)" : "rgba(226, 232, 240, 0.8)"}
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Render lines and area fills per utility */}
              {utilities.map((u) => {
                const color = utilityColors[u] || utilityColors.Default;
                const utilityData = allMonths.map((mStr) => {
                  const record = validRecords.find(
                    (r) => r.utility_type === u && `${String(r.billing_month || "").trim()} ${r.billing_year || ""}` === mStr
                  );
                  return record ? Number(record.units_consumed) : null;
                });

                // Build coordinates points
                const points = utilityData.map((val, idx) => {
                  if (val === null) return null;
                  return { x: getXCoord(idx), y: getYCoord(val), units: val, month: allMonths[idx] };
                }).filter(Boolean) as { x: number; y: number; units: number; month: string }[];

                if (points.length === 0) return null;

                // Create SVG path string
                const pathD = points.reduce((acc, pt, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`, "");
                const areaD = `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

                return (
                  <g key={u}>
                    {/* Area Gradient Fill */}
                    <path d={areaD} fill={`url(#grad-${u})`} />

                    {/* Smooth Line */}
                    <path d={pathD} fill="none" stroke={color.stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Interactive Data Dots */}
                    {points.map((pt, pIdx) => (
                      <g key={pIdx}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="6"
                          fill={color.dot}
                          className="cursor-pointer transition-transform hover:scale-150"
                          onMouseEnter={() => setHoveredPoint({ utility: u, month: pt.month, units: pt.units, x: pt.x, y: pt.y })}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                        <circle cx={pt.x} cy={pt.y} r="3" fill="#ffffff" className="pointer-events-none" />
                      </g>
                    ))}
                  </g>
                );
              })}

              {/* X Axis Labels */}
              {allMonths.map((mStr, idx) => (
                <text
                  key={idx}
                  x={getXCoord(idx)}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  fontWeight="600"
                >
                  {mStr}
                </text>
              ))}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}