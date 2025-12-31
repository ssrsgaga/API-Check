import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import { getLogs, clearLogs } from '../services/dbService';
import { RequestLog, LogFilter } from '../types';

export const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogFilter>({ search: '', status: 'all', apiId: 'all' });
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    const data = await getLogs(200); // Get last 200 logs
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleClear = async () => {
      if (confirm('确定清空所有本地日志吗？')) {
          await clearLogs();
          loadLogs();
      }
  };

  const uniqueApis = useMemo(() => {
    const apiMap = new Map<string, string>();
    logs.forEach(log => {
        if(log.apiId && !apiMap.has(log.apiId)) {
            apiMap.set(log.apiId, log.apiName);
        }
    });
    return Array.from(apiMap.entries());
  }, [logs]);

  const filteredLogs = logs.filter(log => {
      const matchSearch = 
        log.url.toLowerCase().includes(filter.search.toLowerCase()) || 
        (log.model || '').toLowerCase().includes(filter.search.toLowerCase()) ||
        log.status.toString().includes(filter.search);
      
      const matchStatus = filter.status === 'all' 
        ? true 
        : filter.status === 'success' 
            ? (log.status >= 200 && log.status < 300) 
            : (log.status === 0 || log.status >= 400);

      const matchApi = filter.apiId === 'all' || log.apiId === filter.apiId;

      return matchSearch && matchStatus && matchApi;
  });

  const getStatusColor = (status: number) => {
      if (status >= 200 && status < 300) return 'text-success bg-green-100 dark:bg-green-900/30';
      if (status >= 400 && status < 500) return 'text-warning bg-yellow-100 dark:bg-yellow-900/30';
      return 'text-error bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className="h-full flex flex-col animate-fade-in relative">
      {/* Header & Toolbar */}
      <div className="p-4 border-b border-accents-2 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-background z-10">
         <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Icons.Logs size={20}/> 操作审计日志</h2>
            <p className="text-xs text-accents-5">本地存储的最近 200 条请求记录</p>
         </div>
         <div className="flex items-center gap-2 w-full md:w-auto">
             <button onClick={loadLogs} className="p-2 hover:bg-accents-2 rounded-md transition-colors" title="刷新"><Icons.Zap size={16}/></button>
             <button onClick={handleClear} className="p-2 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors" title="清空日志"><Icons.Trash size={16}/></button>
         </div>
      </div>

      {/* Filters */}
      <div className="p-3 bg-accents-1 border-b border-accents-2 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
             <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={14} />
             <input 
                className="w-full pl-9 pr-3 py-1.5 bg-background border border-accents-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="搜索 URL / 模型 / 状态码..."
                value={filter.search}
                onChange={e => setFilter({...filter, search: e.target.value})}
             />
          </div>
          
          <div className="relative min-w-[140px]">
              <select 
                className="w-full pl-3 pr-8 py-1.5 bg-background border border-accents-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-foreground appearance-none cursor-pointer"
                value={filter.apiId}
                onChange={e => setFilter({...filter, apiId: e.target.value})}
              >
                  <option value="all">所有渠道 ({uniqueApis.length})</option>
                  {uniqueApis.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                  ))}
              </select>
              <Icons.ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-accents-4 pointer-events-none" size={14} />
          </div>

          <div className="relative min-w-[120px]">
              <select 
                 className="w-full pl-3 pr-8 py-1.5 bg-background border border-accents-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-foreground appearance-none cursor-pointer"
                 value={filter.status}
                 onChange={e => setFilter({...filter, status: e.target.value as any})}
              >
                  <option value="all">所有</option>
                  <option value="success">成功</option>
                  <option value="error">失败</option>
              </select>
              <Icons.ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-accents-4 pointer-events-none" size={14} />
          </div>
      </div>

      {/* Log List */}
      <div className="flex-1 overflow-auto bg-background">
          {loading ? (
              <div className="flex justify-center p-10 text-accents-4"><Icons.Loading className="animate-spin"/></div>
          ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-accents-4 text-sm">
                  <Icons.FileText size={32} className="mb-2 opacity-20"/>
                  没有找到符合条件的日志
              </div>
          ) : (
              <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-accents-1 text-accents-5 text-xs font-medium uppercase sticky top-0 z-10 shadow-sm">
                      <tr>
                          <th className="p-3 border-b border-accents-2 w-[160px]">时间</th>
                          <th className="p-3 border-b border-accents-2 w-[80px]">方法</th>
                          <th className="p-3 border-b border-accents-2 w-[100px]">状态</th>
                          <th className="p-3 border-b border-accents-2">请求路径 / 模型</th>
                          <th className="p-3 border-b border-accents-2 w-[100px] text-right">延迟</th>
                          <th className="p-3 border-b border-accents-2 w-[60px]"></th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-accents-2">
                      {filteredLogs.map(log => (
                          <tr key={log.id} className="hover:bg-accents-1 transition-colors group cursor-pointer" onClick={() => setSelectedLog(log)}>
                              <td className="p-3 text-accents-5 font-mono text-xs whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                  <div className="text-[10px] opacity-60">{new Date(log.timestamp).toLocaleDateString()}</div>
                              </td>
                              <td className="p-3 font-mono font-bold text-xs">{log.method}</td>
                              <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${getStatusColor(log.status)}`}>
                                      {log.status === 0 ? 'ERR' : log.status}
                                  </span>
                              </td>
                              <td className="p-3 max-w-[200px] md:max-w-none">
                                  <div className="font-mono text-xs truncate mb-0.5" title={log.url}>
                                      {log.url.replace(/^https?:\/\/[^/]+/, '')}
                                  </div>
                                  <div className="text-xs text-accents-5 flex items-center gap-2">
                                      <span className="bg-accents-2 px-1 rounded">{log.type}</span>
                                      {log.model && <span className="font-medium text-foreground">{log.model}</span>}
                                      <span>渠道：{log.apiName}</span>
                                  </div>
                              </td>
                              <td className="p-3 text-right font-mono text-xs">
                                  {log.latency}ms
                              </td>
                              <td className="p-3 text-center text-accents-4">
                                  <Icons.ChevronRight size={16} className="opacity-0 group-hover:opacity-100"/>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
                <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-background w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-accents-2 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-accents-2 bg-accents-1">
                        <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded text-sm font-mono font-bold ${getStatusColor(selectedLog.status)}`}>
                                {selectedLog.method} {selectedLog.status}
                            </span>
                            <span className="font-mono text-sm truncate max-w-[300px]">{selectedLog.url}</span>
                        </div>
                        <button onClick={() => setSelectedLog(null)}><Icons.X size={20}/></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-accents-1 p-4 rounded-lg border border-accents-2">
                            <div>
                                <div className="text-xs text-accents-5 uppercase mb-1">时间戳</div>
                                <div className="font-mono text-sm">{new Date(selectedLog.timestamp).toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs text-accents-5 uppercase mb-1">API 渠道</div>
                                <div className="font-medium text-sm">{selectedLog.apiName}</div>
                            </div>
                            <div>
                                <div className="text-xs text-accents-5 uppercase mb-1">延迟</div>
                                <div className="font-mono text-sm">{selectedLog.latency} ms</div>
                            </div>
                            <div>
                                <div className="text-xs text-accents-5 uppercase mb-1">Request ID</div>
                                <div className="font-mono text-xs truncate">{selectedLog.id}</div>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold mb-2 flex items-center gap-2"><Icons.ArrowRight size={14}/> Request Body</h4>
                            <div className="bg-accents-1 border border-accents-2 rounded-lg p-3 overflow-x-auto relative group">
                                <button 
                                  onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedLog.requestBody, null, 2))}
                                  className="absolute top-2 right-2 p-1.5 bg-background border border-accents-2 rounded text-accents-5 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Icons.Copy size={14}/>
                                </button>
                                <pre className="text-xs font-mono text-accents-6 whitespace-pre-wrap">
                                    {selectedLog.requestBody ? JSON.stringify(selectedLog.requestBody, null, 2) : <span className="text-accents-4 italic">No body</span>}
                                </pre>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold mb-2 flex items-center gap-2"><Icons.ArrowRight size={14} className="rotate-180"/> Response Body / Error</h4>
                            <div className="bg-accents-1 border border-accents-2 rounded-lg p-3 overflow-x-auto relative group">
                                <button 
                                  onClick={() => navigator.clipboard.writeText(typeof selectedLog.responseBody === 'string' ? selectedLog.responseBody : JSON.stringify(selectedLog.responseBody, null, 2))}
                                  className="absolute top-2 right-2 p-1.5 bg-background border border-accents-2 rounded text-accents-5 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Icons.Copy size={14}/>
                                </button>
                                <pre className={`text-xs font-mono whitespace-pre-wrap ${selectedLog.status >= 400 ? 'text-error' : 'text-accents-6'}`}>
                                    {selectedLog.responseBody 
                                      ? (typeof selectedLog.responseBody === 'string' ? selectedLog.responseBody : JSON.stringify(selectedLog.responseBody, null, 2)) 
                                      : <span className="text-accents-4 italic">No response body</span>}
                                </pre>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};