'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Legend, Cell, LabelList,
} from 'recharts';

interface UpliftDataPoint {
  metric: string;
  direct: number;
  agentic: number;
  delta: string;
}

const UPLIFT_DATA: UpliftDataPoint[] = [
  { metric: 'VQA Accuracy', direct: 71.8, agentic: 84.2, delta: '+12.4%' },
  { metric: 'Grounding Acc@0.5', direct: 60.5, agentic: 78.6, delta: '+18.1%' },
  { metric: 'Change F1', direct: 76.7, agentic: 86.0, delta: '+9.3%' },
];

interface AgentUpliftChartProps {
  className?: string;
}

export default function AgentUpliftChart({ className }: AgentUpliftChartProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3
            className="text-sm font-bold text-foreground flex items-center gap-2"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Agentic Routing vs Direct Tool (R7 Uplift)
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Measured accuracy gain via agent pre-processing & DAG routing
          </p>
        </div>
      </div>

      <div className="h-[300px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={UPLIFT_DATA}
            barGap={6}
            barCategoryGap="28%"
            margin={{ top: 20, right: 10, left: -15, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              strokeOpacity={0.4}
              vertical={false}
            />
            <XAxis
              dataKey="metric"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={34}
            />

            <Bar
              dataKey="direct"
              name="Direct (No Agent)"
              fill="#94a3b8"
              radius={[6, 6, 0, 0]}
              maxBarSize={38}
            />

            <Bar
              dataKey="agentic"
              name="SatQuery Agentic"
              radius={[6, 6, 0, 0]}
              maxBarSize={38}
            >
              {UPLIFT_DATA.map((entry, index) => (
                <Cell key={`cell-${index}`} fill="var(--primary)" />
              ))}
              <LabelList
                dataKey="delta"
                position="top"
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fill: '#10b981',
                  fontFamily: 'var(--font-mono)',
                }}
                offset={6}
              />
            </Bar>

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
              formatter={(val: unknown) => [`${val}%`, 'Accuracy']}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
