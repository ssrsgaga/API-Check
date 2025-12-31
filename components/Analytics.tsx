import React, { useEffect, useState, useCallback } from 'react';
import { Icons } from './ui/Icons';
import { getLogs, getLogsStats } from '../services/dbService';
import { ApiConfig, RequestLog } from '../types';

interface AnalyticsProps {
  apis: ApiConfig[];
}

export const Analytics: React.FC<AnalyticsProps> = ({ apis }) => {
  const [stats, setStats] = useState({ total: 0, success: 0, error: 0, avgLatency: 0 });
  const [recentLogs, setRecentLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const s = await getLogsStats();
    const l = await getLogs(50); // Last 50 for sparkline
    setStats(s);
    setRecentLogs(l.reverse()); // Oldest to newest for chart
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0.0';

  // --- SVG Chart Helpers ---
  const renderLatencyChart = () => {
    if (recentLogs.length < 2) return <div className="h-full flex items-center justify-center text-accents-4 text-xs">数据不足</div>;
    
    const height = 60;
    const width = 300;
    const maxLatency = Math.max(...recentLogs.map(l => l.latency), 100);
    const points = recentLogs.map((l, i) => {
      const x = (i / (recentLogs.length - 1)) * width;
      const y = height - (l.latency / maxLatency) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        <defs>
          <linearGradient id="gradientLatency" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={`M0,${height} ${points} L${width},${height} Z`} fill="url(#gradientLatency)" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };

  const renderStatusPie = () => {
    if (stats.total === 0) return <div className="h-32 w-32 rounded-full border-4 border-accents-2 mx-auto" />;
    
    // Simple SVG Pie/Donut
    const size = 100;
    const center = size / 2;
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const successOffset = circumference - (stats.success / stats.total) * circumference;

    return (
      <div className="relative flex justify-center items-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {/* Background Circle (Error color) */}
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--error)" strokeWidth="8" />
          {/* Foreground Circle (Success color) */}
          <circle 
            cx={center} cy={center} r={radius} 
            fill="none" 
            stroke="var(--success)" 
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={successOffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
            <span className="text-xl font-bold">{successRate}%</span>
            <span className="text-[10px] text-accents-5 uppercase">可用率</span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-2xl font-bold tracking-tight">API 状态仪表盘</h2>
           <p className="text-accents-4 text-sm mt-1">实时监控 API 的健康状况与性能指标。</p>
        </div>
        <button onClick={loadData} className="p-2 hover:bg-accents-2 rounded-md" title="刷新数据"><Icons.Zap size={16}/></button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="p-5 rounded-xl border border-accents-2 bg-background flex flex-col justify-between h-32">
             <div className="text-xs font-medium text-accents-5 uppercase flex items-center gap-2"><Icons.Server size={14}/> 接入渠道</div>
             <div className="text-3xl font-bold">{apis.length}</div>
         </div>
         <div className="p-5 rounded-xl border border-accents-2 bg-background flex flex-col justify-between h-32">
             <div className="text-xs font-medium text-accents-5 uppercase flex items-center gap-2"><Icons.Layers size={14}/> 总请求数 (Local)</div>
             <div className="text-3xl font-bold">{stats.total}</div>
         </div>
         <div className="p-5 rounded-xl border border-accents-2 bg-background flex flex-col justify-between h-32">
             <div className="text-xs font-medium text-accents-5 uppercase flex items-center gap-2"><Icons.Clock size={14}/> 平均延迟</div>
             <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">{stats.avgLatency}</span>
                <span className="text-sm text-accents-5 mb-1">ms</span>
             </div>
         </div>
         <div className="p-5 rounded-xl border border-accents-2 bg-background flex flex-col justify-between h-32">
             <div className="text-xs font-medium text-accents-5 uppercase flex items-center gap-2"><Icons.Activity size={14}/> 整体成功率</div>
             <div className={`text-3xl font-bold ${Number(successRate) > 90 ? 'text-success' : Number(successRate) > 50 ? 'text-warning' : 'text-error'}`}>
               {successRate}%
             </div>
         </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Latency Trend */}
          <div className="md:col-span-2 p-6 rounded-xl border border-accents-2 bg-background">
              <h3 className="font-semibold mb-6 flex items-center gap-2"><Icons.Activity size={16}/> 延迟趋势 (最近50次请求)</h3>
              <div className="h-48 w-full text-foreground">
                  {renderLatencyChart()}
              </div>
          </div>

          {/* Success Distribution */}
          <div className="p-6 rounded-xl border border-accents-2 bg-background flex flex-col items-center justify-center">
              <h3 className="font-semibold mb-6 w-full text-left flex items-center gap-2"><Icons.CheckCircle size={16}/> 请求分布</h3>
              {renderStatusPie()}
              <div className="mt-8 w-full grid grid-cols-2 gap-4 text-center">
                  <div>
                      <div className="text-2xl font-bold text-success">{stats.success}</div>
                      <div className="text-xs text-accents-5 uppercase">成功</div>
                  </div>
                  <div>
                      <div className="text-2xl font-bold text-error">{stats.error}</div>
                      <div className="text-xs text-accents-5 uppercase">失败</div>
                  </div>
              </div>
          </div>
      </div>

      {/* Channel Status Table */}
      <div className="border border-accents-2 rounded-xl overflow-hidden bg-background">
         <div className="p-4 border-b border-accents-2 bg-accents-1 font-semibold text-sm">渠道状态概览</div>
         <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
                 <thead className="bg-accents-1 text-accents-5 text-xs uppercase">
                     <tr>
                         <th className="px-4 py-3 font-medium">名称</th>
                         <th className="px-4 py-3 font-medium">Base URL</th>
                         <th className="px-4 py-3 font-medium text-right">状态</th>
                     </tr>
                 </thead>
                 <tbody>
                     {apis.map(api => (
                         <tr key={api.id} className="border-b border-accents-2 last:border-0 hover:bg-accents-1 transition-colors">
                             <td className="px-4 py-3 font-medium">{api.name}</td>
                             <td className="px-4 py-3 font-mono text-xs text-accents-5">{api.baseUrl}</td>
                             <td className="px-4 py-3 text-right">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-accents-2 text-accents-6">
                                    配置就绪
                                </span>
                             </td>
                         </tr>
                     ))}
                     {apis.length === 0 && (
                         <tr><td colSpan={3} className="p-8 text-center text-accents-4">无数据</td></tr>
                     )}
                 </tbody>
             </table>
         </div>
      </div>
    </div>
  );
};