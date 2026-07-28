"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface RevenueChartProps {
  data: { label: string; amount: number }[];
}

/** E8-T02 — "Graphique revenus mensuel (React/Recharts)". */
export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#8A8A8A" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "#F7F7F5" }}
          formatter={(value) => [
            `${new Intl.NumberFormat("fr-FR").format(Number(value))} Ar`,
            "Revenus",
          ]}
        />
        <Bar dataKey="amount" fill="#1A2B5F" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
