import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import { Checkbox } from './ui/Checkbox';
import { testModelLatency, fetchModels } from '../services/llmService';
import { ApiConfig, MatrixRowResult, MatrixCellResult, GlobalSettings } from '../types';

interface BulkTestViewProps {
  globalSettings: GlobalSettings;
  onImport: (apis: ApiConfig[]) => void;
  showToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const DEFAULT_MODELS = [
  'gpt-3.5-turbo',
  'gpt-4',
  'gpt-4o',
  'claude-3-5-sonnet-20240620',
  'gemini-1.5-pro-latest'
];

export const BulkTestView: React.FC<BulkTestViewProps> = ({ globalSettings, onImport, showToast }) => {
  // Inputs
  const [baseUrl, setBaseUrl] = useState('');
  const [keysInput, setKeysInput] = useState('');
  
  // Model Selection
  const [targetModels, setTargetModels] = useState<string[]>(DEFAULT_MODELS);
  const [customModelInput, setCustomModelInput] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  
  // Test State
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<MatrixRowResult[]>([]);
  
  // Details Modal
  const [selectedCell, setSelectedCell] = useState<{key: string, model: string, result: MatrixCellResult} | null>(null);
  
  // Selection for Import
  const [selectedResultKeys, setSelectedResultKeys] = useState<Set<string>>(new Set());

  // --- Handlers: Model Management ---
  const toggleModel = (model: string) => {
    if (targetModels.includes(model)) {
      setTargetModels(targetModels.filter(m => m !== model));
    } else {
      setTargetModels([...targetModels, model]);
    }
  };

  const addCustomModel = () => {
    const trimmed = customModelInput.trim();
    if (trimmed && !targetModels.includes(trimmed)) {
      setTargetModels([...targetModels, trimmed]);
      setCustomModelInput('');
    }
  };

  const fetchModelsFromApi = async () => {
      if (!baseUrl.trim()) { showToast('error', '请先填写接口地址'); return; }
      const firstKey = keysInput.split('\n').map(k => k.trim()).filter(k => k)[0];
      if (!firstKey) { showToast('error', '请至少填写一个 Key 用于获取模型'); return; }

      setIsFetchingModels(true);
      try {
          const tempApi: ApiConfig = {
              id: 'temp', name: 'Temp', baseUrl, apiKey: firstKey,
              connectionMode: 'standard', features: ['models'], createdAt: 0
          };
          const models = await fetchModels(tempApi);
          if (models.length > 0) {
              const modelIds = models.map(m => m.id);
              // Merge with existing, avoiding duplicates
              const uniqueModels = Array.from(new Set([...targetModels, ...modelIds]));
              setTargetModels(uniqueModels);
              showToast('success', `成功获取 ${models.length} 个模型`);
          } else {
              showToast('error', '接口返回了空模型列表');
          }
      } catch (e: any) {
          console.error(e);
          showToast('error', `获取失败: ${e.message}`);
      } finally {
          setIsFetchingModels(false);
      }
  };

  // --- Handlers: Running Tests ---
  const handleStart = async () => {
    if (!baseUrl.trim()) { showToast('error', '请输入接口地址'); return; }
    if (!keysInput.trim()) { showToast('error', '请输入 API Keys'); return; }
    if (targetModels.length === 0) { showToast('error', '请至少选择一个测试模型'); return; }

    const keys = keysInput.split('\n').map(k => k.trim()).filter(k => k);
    if (keys.length === 0) return;

    setIsRunning(true);
    setResults([]);
    // Initialize results with pending
    const initialResults: MatrixRowResult[] = keys.map(key => ({
      key,
      results: {}
    }));
    setResults(initialResults);
    setSelectedResultKeys(new Set()); // Reset selection

    const totalTasks = keys.length * targetModels.length;
    setProgress({ current: 0, total: totalTasks });

    let completed = 0;
    
    // Create a flattened task queue
    const tasks: { key: string; model: string }[] = [];
    keys.forEach(key => {
        targetModels.forEach(model => {
            tasks.push({ key, model });
        });
    });

    const worker = async () => {
        while (tasks.length > 0) {
            const task = tasks.shift();
            if (!task) break;

            const { key, model } = task;
            
            // Construct temp config
            const tempApi: ApiConfig = {
                id: 'temp', name: 'temp', baseUrl: baseUrl, apiKey: key,
                connectionMode: 'standard', features: ['chat'], createdAt: 0
            };

            const result = await testModelLatency(tempApi, model, globalSettings.testTimeout);
            
            setResults(prev => {
                const next = [...prev];
                const rowIndex = next.findIndex(r => r.key === key);
                if (rowIndex !== -1) {
                    next[rowIndex] = {
                        ...next[rowIndex],
                        results: {
                            ...next[rowIndex].results,
                            [model]: {
                                latency: result.latency,
                                status: result.status,
                                message: result.message,
                                statusCode: result.statusCode,
                                requestBody: result.requestBody,
                                responseBody: result.responseBody
                            }
                        }
                    };
                }
                return next;
            });

            completed++;
            setProgress({ current: completed, total: totalTasks });
        }
    };

    const workers = Array(Math.min(globalSettings.testConcurrency, tasks.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    setIsRunning(false);
    showToast('success', '批量测试完成');
  };

  // --- Handlers: Import & Export ---
  const toggleKeySelection = (key: string) => {
      const next = new Set(selectedResultKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelectedResultKeys(next);
  };

  const toggleAllKeys = () => {
      if (selectedResultKeys.size === results.length) {
          setSelectedResultKeys(new Set());
      } else {
          setSelectedResultKeys(new Set(results.map(r => r.key)));
      }
  };

  const handleImport = () => {
      const selectedRows = results.filter(r => selectedResultKeys.has(r.key));
      if (selectedRows.length === 0) {
          showToast('error', '未选择任何 Key');
          return;
      }

      const newApis: ApiConfig[] = selectedRows.map((row, idx) => ({
          id: crypto.randomUUID(),
          name: `Imported ${new Date().toLocaleTimeString()} - ${row.key.slice(0, 4)}`,
          baseUrl: baseUrl,
          apiKey: row.key,
          features: ['chat', 'models'], // assume full features
          connectionMode: 'standard',
          createdAt: Date.now() + idx
      }));

      onImport(newApis);
  };

  const handleExportKeys = (type: 'working' | 'failed' | 'all') => {
      if (results.length === 0) {
          showToast('info', '暂无测试结果');
          return;
      }

      let keysToExport: string[] = [];
      
      if (type === 'all') {
          keysToExport = results.map(r => r.key);
      } else if (type === 'working') {
          // A key is "working" if at least one model returns success
          keysToExport = results
             .filter(r => (Object.values(r.results) as MatrixCellResult[]).some(res => res.status === 'success'))
             .map(r => r.key);
      } else if (type === 'failed') {
          // A key is "failed" if NO model returns success
          keysToExport = results
             .filter(r => {
                 const hasResults = Object.keys(r.results).length > 0;
                 const allFailed = (Object.values(r.results) as MatrixCellResult[]).every(res => res.status !== 'success');
                 return hasResults && allFailed;
             })
             .map(r => r.key);
      }

      if (keysToExport.length === 0) {
          showToast('info', '没有符合条件的 Keys');
          return;
      }

      navigator.clipboard.writeText(keysToExport.join('\n'))
          .then(() => showToast('success', `已复制 ${keysToExport.length} 个 Key`))
          .catch(() => showToast('error', '复制失败'));
  };

  const handleExportReport = (format: 'json' | 'csv') => {
      if (results.length === 0) {
          showToast('info', '暂无测试结果');
          return;
      }

      if (format === 'json') {
          const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bulk-test-report-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('success', 'JSON 报告已下载');
      } else if (format === 'csv') {
          // Headers
          let csv = 'API Key,' + targetModels.join(',') + '\n';
          
          results.forEach(row => {
              const line = [row.key];
              targetModels.forEach(m => {
                  const res = row.results[m];
                  if (!res) line.push('N/A');
                  else if (res.status === 'success') line.push('OK');
                  else line.push('FAIL');
              });
              csv += line.join(',') + '\n';
          });

          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bulk-test-report-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('success', 'CSV 报告已下载');
      }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in relative">
        {/* Header */}
        <div className="p-6 border-b border-accents-2 bg-background shrink-0 flex justify-between items-center">
             <div>
                <h1 className="text-2xl font-bold flex items-center gap-2"><Icons.ListChecks className="text-foreground"/> 批量测活实验室</h1>
                <p className="text-accents-5 text-sm mt-1">对多个 Key 和模型进行交叉矩阵测试。</p>
             </div>
             {isRunning && (
                 <div className="flex items-center gap-3 text-sm font-mono bg-accents-1 px-3 py-1.5 rounded-full border border-accents-2">
                     <Icons.Loading className="animate-spin text-success" size={14} />
                     <span>{progress.current} / {progress.total}</span>
                 </div>
             )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            {/* Configuration Panel */}
            <div className="w-full lg:w-[400px] border-b lg:border-b-0 lg:border-r border-accents-2 bg-accents-1 overflow-y-auto p-4 flex flex-col gap-6 shrink-0">
                <div className="space-y-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2 uppercase tracking-wider text-accents-5"><Icons.Server size={14}/> 接口配置</h3>
                    <div>
                        <label className="text-xs text-accents-5 mb-1 block">接口地址 (Base URL)</label>
                        <input 
                          className="w-full px-3 py-2 bg-background border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground text-sm"
                          placeholder="https://api.openai.com/v1"
                          value={baseUrl}
                          onChange={e => setBaseUrl(e.target.value)}
                          disabled={isRunning}
                        />
                    </div>
                    <div className="flex-1 flex flex-col">
                        <label className="text-xs text-accents-5 mb-1 block">API Keys (一行一个)</label>
                        <textarea 
                           className="w-full h-32 px-3 py-2 bg-background border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground text-xs font-mono resize-none"
                           placeholder="sk-..."
                           value={keysInput}
                           onChange={e => setKeysInput(e.target.value)}
                           disabled={isRunning}
                        />
                         <div className="text-right text-[10px] text-accents-4 mt-1">
                            {keysInput.split('\n').filter(k => k.trim()).length} 个 Keys
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-sm flex items-center gap-2 uppercase tracking-wider text-accents-5"><Icons.Layers size={14}/> 测试模型</h3>
                        <button 
                           onClick={fetchModelsFromApi} 
                           disabled={isFetchingModels || isRunning}
                           className="text-xs flex items-center gap-1 text-success hover:underline disabled:opacity-50"
                        >
                           {isFetchingModels ? <Icons.Loading className="animate-spin" size={10}/> : <Icons.Download size={10}/>}
                           从接口获取
                        </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        {targetModels.map(model => (
                            <button
                                key={model}
                                onClick={() => !isRunning && toggleModel(model)}
                                className={`px-2 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${
                                    'bg-foreground text-background border-foreground'
                                }`}
                            >
                                {model}
                                <span 
                                  onClick={(e) => { e.stopPropagation(); toggleModel(model); }}
                                  className="hover:text-error/80 cursor-pointer"
                                >
                                  <Icons.X size={10}/>
                                </span>
                            </button>
                        ))}
                        {targetModels.length === 0 && <div className="text-xs text-accents-4">请添加或获取模型</div>}
                    </div>

                    <div className="relative">
                        <input 
                            className="w-full px-3 py-2 bg-background border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground text-xs"
                            placeholder="添加自定义模型 (回车)..."
                            value={customModelInput}
                            onChange={e => setCustomModelInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addCustomModel(); }}
                            disabled={isRunning}
                        />
                        <button onClick={addCustomModel} className="absolute right-2 top-1/2 -translate-y-1/2 text-accents-4 hover:text-foreground"><Icons.Plus size={14}/></button>
                    </div>
                </div>

                <button 
                  onClick={handleStart}
                  disabled={isRunning}
                  className="w-full py-3 bg-foreground text-background rounded-md text-sm font-bold hover:opacity-90 disabled:opacity-50 flex justify-center items-center gap-2 mt-auto shadow-md"
                >
                  {isRunning ? <Icons.Loading className="animate-spin" size={16} /> : <Icons.Play size={16} />}
                  {isRunning ? '测试运行中...' : '开始矩阵测试'}
                </button>
            </div>

            {/* Results Matrix */}
            <div className="flex-1 overflow-hidden bg-background flex flex-col relative">
                {results.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-accents-3">
                        <Icons.Grid size={48} strokeWidth={1} className="mb-4 opacity-20"/>
                        <p>请在左侧配置并开始测试</p>
                    </div>
                ) : (
                    <>
                        <div className="p-2 border-b border-accents-2 bg-accents-1 flex justify-between items-center text-xs">
                             <div className="flex items-center gap-2">
                                 <span className="font-bold">测试结果</span>
                                 <span className="text-accents-5">({results.length} Keys × {targetModels.length} Models)</span>
                             </div>
                             
                             <div className="flex items-center gap-2">
                                {/* Export Dropdown for Keys */}
                                <div className="relative group">
                                    <button className="flex items-center gap-1.5 bg-background border border-accents-2 px-3 py-1 rounded hover:bg-accents-2 transition-colors font-medium">
                                        <Icons.Export size={12} /> 导出 Keys
                                    </button>
                                    <div className="absolute right-0 top-full mt-1 w-40 bg-background border border-accents-2 rounded shadow-lg p-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                                        <button onClick={() => handleExportKeys('working')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2 text-success">
                                            <Icons.CheckCircle size={12}/> 复制可用 Key
                                        </button>
                                        <button onClick={() => handleExportKeys('failed')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2 text-error">
                                            <Icons.XCircle size={12}/> 复制失败 Key
                                        </button>
                                        <button onClick={() => handleExportKeys('all')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2">
                                            <Icons.Copy size={12}/> 复制所有 Key
                                        </button>
                                    </div>
                                </div>

                                {/* Export Reports */}
                                <div className="relative group">
                                    <button className="flex items-center gap-1.5 bg-background border border-accents-2 px-3 py-1 rounded hover:bg-accents-2 transition-colors font-medium">
                                        <Icons.FileText size={12} /> 导出报告
                                    </button>
                                    <div className="absolute right-0 top-full mt-1 w-40 bg-background border border-accents-2 rounded shadow-lg p-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                                        <button onClick={() => handleExportReport('json')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2">
                                            <Icons.Code size={12}/> 导出 JSON
                                        </button>
                                        <button onClick={() => handleExportReport('csv')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2">
                                            <Icons.FileType size={12}/> 导出 CSV
                                        </button>
                                    </div>
                                </div>

                                {selectedResultKeys.size > 0 && (
                                    <div className="h-4 w-px bg-accents-2 mx-1"/>
                                )}

                                {selectedResultKeys.size > 0 && (
                                    <button onClick={handleImport} className="flex items-center gap-1 bg-success text-white px-3 py-1 rounded hover:opacity-90 transition-opacity font-medium shadow-sm">
                                        <Icons.Import size={12} /> 导入选中 ({selectedResultKeys.size})
                                    </button>
                                )}
                             </div>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead className="bg-accents-1 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 border-b border-accents-2 w-[50px] text-center">
                                            <Checkbox checked={selectedResultKeys.size === results.length && results.length > 0} onChange={toggleAllKeys} />
                                        </th>
                                        <th className="p-3 border-b border-accents-2 font-medium text-accents-5 uppercase min-w-[150px]">API Key</th>
                                        {targetModels.map(m => (
                                            <th key={m} className="p-3 border-b border-accents-2 font-medium text-accents-5 uppercase min-w-[100px] text-center">{m}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-accents-2">
                                    {results.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-accents-1 transition-colors">
                                            <td className="p-3 text-center">
                                                <Checkbox checked={selectedResultKeys.has(row.key)} onChange={() => toggleKeySelection(row.key)} />
                                            </td>
                                            <td className="p-3 font-mono text-accents-6 truncate max-w-[150px]" title={row.key}>
                                                {row.key.slice(0, 8)}...{row.key.slice(-4)}
                                            </td>
                                            {targetModels.map(m => {
                                                const cell = row.results[m];
                                                return (
                                                    <td 
                                                      key={m} 
                                                      className="p-3 text-center border-l border-accents-2 cursor-pointer hover:bg-accents-2 transition-colors"
                                                      onClick={() => cell && setSelectedCell({ key: row.key, model: m, result: cell })}
                                                    >
                                                        {!cell ? (
                                                            <span className="text-accents-3">–</span>
                                                        ) : cell.status === 'pending' ? (
                                                            <span className="text-accents-4">...</span>
                                                        ) : cell.status === 'success' ? (
                                                            <div className="flex flex-col items-center">
                                                                <Icons.CheckCircle size={14} className="text-success mb-0.5"/>
                                                                <span className="text-[10px] text-accents-5">{cell.latency}ms</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex justify-center" title={cell.message}>
                                                                <Icons.ErrorCircle size={14} className="text-error"/>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>

        {/* Details Modal */}
        <AnimatePresence>
          {selectedCell && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-lg max-h-[80vh] rounded-xl shadow-2xl overflow-hidden border border-accents-2 flex flex-col">
                  <div className="p-4 border-b border-accents-2 font-semibold flex justify-between items-center bg-accents-1">
                    <div>
                      <div className="text-xs text-accents-5 uppercase">Test Details</div>
                      <div className="font-mono text-sm">{selectedCell.model}</div>
                    </div>
                    <button onClick={() => setSelectedCell(null)}><Icons.X size={18} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                     <div className="p-3 bg-accents-1 rounded border border-accents-2 font-mono text-xs break-all">
                        <span className="font-bold">Key:</span> {selectedCell.key}
                     </div>
                     
                     <div className="grid grid-cols-2 gap-4">
                        <div className={`p-3 border rounded text-center ${selectedCell.result.status === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                           <div className="text-xs uppercase opacity-70">Status</div>
                           <div className="font-bold">{selectedCell.result.statusCode || (selectedCell.result.status === 'success' ? 200 : 'ERR')}</div>
                        </div>
                        <div className="p-3 border border-accents-2 rounded bg-accents-1 text-center">
                           <div className="text-xs uppercase opacity-70 text-accents-5">Latency</div>
                           <div className="font-bold">{selectedCell.result.latency} ms</div>
                        </div>
                     </div>

                     {selectedCell.result.message && (
                        <div className="p-3 bg-accents-1 border border-accents-2 rounded text-xs text-accents-6">
                           <span className="font-bold">Message:</span> {selectedCell.result.message}
                        </div>
                     )}

                     <div>
                        <h4 className="text-xs font-bold uppercase text-accents-5 mb-2">Request Body</h4>
                        <pre className="bg-accents-1 border border-accents-2 rounded p-2 text-[10px] font-mono overflow-auto max-h-40">
                           {JSON.stringify(selectedCell.result.requestBody, null, 2)}
                        </pre>
                     </div>

                     <div>
                        <h4 className="text-xs font-bold uppercase text-accents-5 mb-2">Response Body</h4>
                        <pre className={`bg-accents-1 border border-accents-2 rounded p-2 text-[10px] font-mono overflow-auto max-h-60 ${selectedCell.result.status === 'error' ? 'text-error' : 'text-accents-6'}`}>
                           {typeof selectedCell.result.responseBody === 'string' 
                              ? selectedCell.result.responseBody 
                              : JSON.stringify(selectedCell.result.responseBody, null, 2)}
                        </pre>
                     </div>
                  </div>
               </motion.div>
             </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
};