'use client';

import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Legend, Tooltip,
} from 'recharts';

interface RadarDataPoint {
  axis: string;
  satquery: number;
  vanilla: number;
  baseline: number;
}

const RADAR_DATA: RadarDataPoint[] = [
  { axis: 'Single-Image VQA', satquery: 91.4, vanilla: 72.1, baseline: 88.3 },
  { axis: 'Dense Captioning', satquery: 86.2, vanilla: 64.8, baseline: 82.1 },
  { axis: 'Grounding Acc@0.5', satquery: 78.6, vanilla: 54.2, baseline: 72.4 },
  { axis: 'Change F1 / IoU', satquery: 86.0, vanilla: 58.3, baseline: 79.8 },
  { axis: 'Cross-Modal Agreement', satquery: 89.5, vanilla: 41.2, baseline: 76.0 },
];

interface BenchmarkRadarChartProps {
  highlightAxis?: string;
  className?: string;
}

export default function BenchmarkRadarChart({ highlightAxis, className }: BenchmarkRadarChartProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3
            className="text-sm font-bold text-foreground flex items-center gap-2"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
            Multi-Axis Accuracy Comparison Matrix
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            SatQuery Agentic vs Vanilla VLM vs Task-Specific SOTA
          </p>
        </div>
      </div>

      <div className="h-[300px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={RADAR_DATA} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid
              stroke="var(--border)"
              strokeOpacity={0.6}
            />
            <PolarAngleAxis
              dataKey="axis"
              tick={({ x, y, payload }) => {
                const isHighlighted = highlightAxis && payload?.value === highlightAxis;
                return (
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-muted-foreground"
                    style={{
                      fontSize: '10px',
                      fontWeight: isHighlighted ? 700 : 500,
                      fill: isHighlighted ? 'var(--primary)' : undefined,
                    }}
                  >
                    {payload?.value}
                  </text>
                );
              }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 9 }}
              stroke="var(--border)"
              strokeOpacity={0.3}
            />

            {/* Task-Specific SOTA Baseline */}
            <Radar
              name="Task-Specific SOTA"
              dataKey="baseline"
              stroke="#94a3b8"
              fill="transparent"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />

            {/* Vanilla GPT-4V / Gemini */}
            <Radar
              name="Vanilla GPT-4V"
              dataKey="vanilla"
              stroke="#f59e0b"
              fill="#f59e0b"
              fillOpacity={0.08}
              strokeWidth={1.5}
            />

            {/* SatQuery Agentic Pipeline */}
            <Radar
              name="SatQuery Agentic"
              dataKey="satquery"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.2}
              strokeWidth={2.5}
            />

            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                fontSize: '11px',
                color: 'var(--foreground)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              }}
              formatter={(val: unknown) => [`${val}%`, 'Score']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
