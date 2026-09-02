'use client';

// F5 Historical Scenes — Analytics Charts (Extensions PRD §8)
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface ChartsProps {
  data?: {
    scenes_over_time?: any[];
    task_mix?: any[];
    tool_usage?: any[];
    confidence_trend?: any[];
    modality_mix?: any[];
    change_totals?: any[];
  };
}

const CUSTOM_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  borderColor: 'rgba(51, 65, 85, 0.8)',
  borderRadius: '12px',
  color: '#f8fafc',
  fontSize: '11px',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
};

export default function Charts({ data }: ChartsProps) {
  const timeData = data?.scenes_over_time || [];
  const taskData = data?.task_mix || [];
  const toolData = data?.tool_usage || [];
  const confData = data?.confidence_trend || [];
  const modalityData = data?.modality_mix || [];
  const changeData = data?.change_totals || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Scenes Analyzed Over Time (Stacked Area) */}
      <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Historical Ingest & Analysis (2020 – 2026)</span>
            <span className="text-[10px] text-primary font-mono lowercase">annual trend</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOptical" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorSAR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorBi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
              <Area type="monotone" dataKey="optical" name="Optical (S2)" stackId="1" stroke="#3b82f6" fill="url(#colorOptical)" />
              <Area type="monotone" dataKey="sar" name="SAR (S1/RISAT)" stackId="1" stroke="#10b981" fill="url(#colorSAR)" />
              <Area type="monotone" dataKey="bi_temporal" name="Bi-temporal Pairs" stackId="1" stroke="#f59e0b" fill="url(#colorBi)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 2. Task Type Mix (Bar Chart) */}
      <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Remote Sensing Task Distribution</span>
            <span className="text-[10px] text-emerald-500 font-mono">query mix</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={taskData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis dataKey="task" type="category" stroke="#94a3b8" fontSize={9} width={95} tickLine={false} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Bar dataKey="count" name="Queries" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 3. Tool Usage & Average Confidence */}
      <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Tool Invocations & Accuracy</span>
            <span className="text-[10px] text-cyan-500 font-mono">planner execution</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={toolData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="tool" stroke="#94a3b8" fontSize={8} tickLine={false} interval={0} angle={-20} textAnchor="end" height={35} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Bar dataKey="count" name="Invocations" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 4. Confidence & Abstention Trend */}
      <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Confidence & Abstention Calibration</span>
            <span className="text-[10px] text-amber-500 font-mono">quality gate</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={confData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} domain={[0, 1]} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="confidence" name="Mean Confidence" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="abstention_pct" name="Abstention %" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 5. Modality Breakdown (Donut) */}
      <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Sensor & Modality Archive Ratio</span>
            <span className="text-[10px] text-blue-500 font-mono">data sources</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-1 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={modalityData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {modalityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill || '#3b82f6'} />
                ))}
              </Pie>
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 6. Cumulative Change Measurements (Hectares) */}
      <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Documented Surface Changes (Hectares)</span>
            <span className="text-[10px] text-purple-500 font-mono">10-year tally</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={changeData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="category" stroke="#94a3b8" fontSize={9} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Bar dataKey="area_ha" name="Area (ha)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
