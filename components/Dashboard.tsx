import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import { ApiConfig, Model, TestResult, ToolTestResult, ChatMessage, ToastMessage, ChatConfig, DebugInfo, GlobalSettings, ViewMode } from '../types';
import { fetchModels, testModelLatency, testModelToolSupport, sendChatMessage, prepareChatBody } from '../services/llmService';
import { clearLogs } from '../services/dbService';
import { ToastContainer } from './ui/Toast';
import { PromptLibrary } from './PromptLibrary';
import { Documentation } from './Documentation';
import { LogViewer } from './LogViewer';
import { BulkTestView } from './BulkTestView';
import { AddApiView } from './AddApiView';
import { Checkbox } from './ui/Checkbox';
import { DataSyncModal } from './DataSyncModal';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface DashboardProps {
  toggleTheme: () => void;
  isDark: boolean;
}

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  temperature: 0.7,
  top_p: 1.0,
  frequency_penalty: 0,
  presence_penalty: 0,
  max_tokens: 4096,
  stream: true,
  enableImage: false,
  imageUrl: ''
};

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  testTimeout: 15,
  testConcurrency: 50,
  testRounds: 1,
  stream: false
};

export const Dashboard: React.FC<DashboardProps> = ({ toggleTheme, isDark }) => {
  // --- State: View & Sidebar ---
  const [currentView, setCurrentView] = useState<ViewMode>('chat');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- State: Core ---
  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null);
  const [editingApiId, setEditingApiId] = useState<string | null>(null); // For passing to AddApiView
  
  // --- State: Settings & Import/Export ---
  // globalSettings is the applied configuration
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  // settingsForm is the form state in the settings view (not yet applied)
  const [settingsForm, setSettingsForm] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  
  const [importUrl, setImportUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncInitialId, setSyncInitialId] = useState('');

  // --- State: Models & Tests ---
  const [models, setModels] = useState<Model[]>([]);
  const [manualModelId, setManualModelId] = useState(''); // For Chat-Only APIs
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null); 
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [toolTestResults, setToolTestResults] = useState<Record<string, ToolTestResult>>({});
  const [activeTestMode, setActiveTestMode] = useState<'latency' | 'tool'>('latency');
  const [isTesting, setIsTesting] = useState(false);
  const [testingModelIds, setTestingModelIds] = useState<Set<string>>(new Set()); // Track individually running tests
  const [testProgress, setTestProgress] = useState<{current: number, total: number} | null>(null);
  const [selectedToolResult, setSelectedToolResult] = useState<ToolTestResult | null>(null); // For modal detail
  const [selectedTestResult, setSelectedTestResult] = useState<TestResult | null>(null); // For latency detail modal
  
  // --- State: Run Configuration Modal ---
  const [showRunConfigModal, setShowRunConfigModal] = useState(false);
  const [runConfig, setRunConfig] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);

  // --- State: Confirmation Modal ---
  const [confirmModal, setConfirmModal] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
      confirmText?: string;
      isDanger?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // --- State: Filtering ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'error' | 'pending'>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');

  // --- State: Chat & Config ---
  const [activeChatModel, setActiveChatModel] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [contextMessages, setContextMessages] = useState<ChatMessage[]>([
    { role: 'system', content: '你是一个乐于助人的 AI 助手。' }
  ]);
  const [isChatting, setIsChatting] = useState(false);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);
  const [showParams, setShowParams] = useState(false); 
  
  // --- State: Debugging & Export & Prompts ---
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({ previewBody: '' });
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isPromptLibModalOpen, setIsPromptLibModalOpen] = useState(false); 

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); 

  // --- State: UI ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // --- Computed State: Current API & Status ---
  const currentApi = useMemo(() => apis.find(a => a.id === selectedApiId), [apis, selectedApiId]);
  const isManualMode = currentApi?.features && !currentApi.features.includes('models');

  const connectionStatus = useMemo(() => {
    if (!currentApi) return null;
    if (isLoadingModels) return { type: 'loading', text: '连接中...', color: 'text-warning' };
    if (fetchError) return { type: 'error', text: '连接异常', color: 'text-error' };
    if (isManualMode) return { type: 'manual', text: '手动模式', color: 'text-blue-500' };
    if (models.length > 0) return { type: 'success', text: '已连接', color: 'text-success' };
    return { type: 'idle', text: '就绪', color: 'text-accents-5' };
  }, [currentApi, isLoadingModels, fetchError, models, isManualMode]);

  const uniqueOwners = useMemo(() => {
      const owners = new Set(models.map(m => m.owned_by));
      return Array.from(owners).sort();
  }, [models]);

  // --- Helper: Toast ---
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message }]);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // --- Effects: Persistence ---
  useEffect(() => {
    const savedApis = localStorage.getItem('omni_apis');
    if (savedApis) {
      const parsed = JSON.parse(savedApis);
      setApis(parsed);
      if (parsed.length > 0 && !selectedApiId) {
        setSelectedApiId(parsed[0].id);
      }
    }
    const savedSettings = localStorage.getItem('omni_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      const merged = { ...DEFAULT_GLOBAL_SETTINGS, ...parsed };
      setGlobalSettings(merged);
      setSettingsForm(merged);
    }

    // Check URL params for sync_id
    const params = new URLSearchParams(window.location.search);
    const syncId = params.get('sync_id');
    if (syncId) {
        setSyncInitialId(syncId);
        setShowSyncModal(true);
        // Clean URL without reload
        window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('omni_apis', JSON.stringify(apis));
  }, [apis]);

  useEffect(() => {
    localStorage.setItem('omni_settings', JSON.stringify(globalSettings));
  }, [globalSettings]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatting]);

  // --- Handlers: Settings Save ---
  const handleSaveSettings = () => {
      setGlobalSettings(settingsForm);
      showToast('success', '全局配置已保存');
  };

  // --- Handlers: Data Import/Export & Reset ---
  const getAllDataForExport = () => {
    return {
        apis,
        settings: globalSettings,
        prompts: JSON.parse(localStorage.getItem('omni_prompts') || '[]'),
        version: 1,
        exportedAt: Date.now()
    };
  };

  const handleExportData = () => {
    const data = getAllDataForExport();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-check-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', '所有数据已导出');
  };

  const processImportData = (data: any) => {
    try {
      let apiCount = 0;
      let promptCount = 0;
      if (data.apis && Array.isArray(data.apis)) {
        setApis(prev => {
          // Merge logic: avoid duplicate IDs
          const existingIds = new Set(prev.map(a => a.id));
          const newApis = data.apis.filter((a: ApiConfig) => !existingIds.has(a.id));
          apiCount = newApis.length;
          return [...prev, ...newApis];
        });
      }
      if (data.settings) {
        setGlobalSettings(data.settings);
        setSettingsForm(data.settings);
      }
      if (data.prompts && Array.isArray(data.prompts)) {
        const currentPrompts = JSON.parse(localStorage.getItem('omni_prompts') || '[]');
        const existingIds = new Set(currentPrompts.map((p: any) => p.id));
        const newPrompts = data.prompts.filter((p: any) => !existingIds.has(p.id));
        promptCount = newPrompts.length;
        localStorage.setItem('omni_prompts', JSON.stringify([...currentPrompts, ...newPrompts]));
      }
      showToast('success', `导入成功: ${apiCount} 个连接, ${promptCount} 个提示词`);
    } catch (e) {
      showToast('error', '数据格式错误');
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        processImportData(json);
      } catch (err) {
        showToast('error', '无法解析 JSON 文件');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUrlImport = async () => {
    if (!importUrl) return;
    try {
      showToast('info', '正在从 URL 获取配置...');
      const res = await fetch(importUrl);
      if (!res.ok) throw new Error('网络请求失败');
      const json = await res.json();
      processImportData(json);
      setImportUrl('');
    } catch (e) {
      showToast('error', '导入失败，请检查 URL 或跨域设置');
    }
  };

  const handleResetData = async () => {
    setConfirmModal({
        isOpen: true,
        title: '重置所有数据',
        message: '警告：此操作将清除所有 API 连接、聊天记录和设置。此操作无法撤销。',
        isDanger: true,
        confirmText: '确认重置',
        onConfirm: async () => {
            try {
                localStorage.removeItem('omni_apis');
                localStorage.removeItem('omni_settings');
                localStorage.removeItem('omni_prompts');
                await clearLogs();
                
                // State reset
                setApis([]);
                setGlobalSettings(DEFAULT_GLOBAL_SETTINGS);
                setSettingsForm(DEFAULT_GLOBAL_SETTINGS);
                setChatMessages([]);
                setTestResults({});
                setModels([]);
                
                showToast('success', '所有数据已重置');
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setTimeout(() => window.location.reload(), 1000);
            } catch (e) {
                showToast('error', '重置失败');
            }
        }
    });
  };

  // --- Handlers: API Management ---
  const handleSaveApi = (config: ApiConfig) => {
    if (editingApiId) {
      setApis(prev => prev.map(a => a.id === editingApiId ? config : a));
      showToast('success', '连接已更新');
    } else {
      setApis(prev => [...prev, config]);
      setSelectedApiId(config.id);
      showToast('success', '新连接已创建');
    }
    setCurrentView('chat');
    setEditingApiId(null);
  };

  const handleEditApi = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setEditingApiId(id);
    setCurrentView('add_api');
  };

  const handleRemoveApi = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmModal({
        isOpen: true,
        title: '删除连接',
        message: '确定要删除这个 API 连接吗？该操作无法撤销。',
        isDanger: true,
        onConfirm: () => {
            const filtered = apis.filter(a => a.id !== id);
            setApis(filtered);
            if (selectedApiId === id) setSelectedApiId(filtered[0]?.id || null);
            showToast('info', '连接已删除');
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
    });
  };

  const handleBulkImport = (newApis: ApiConfig[]) => {
      setApis(prev => [...prev, ...newApis]);
      showToast('success', `成功导入 ${newApis.length} 个连接`);
  };

  // --- Handlers: Model Fetching ---
  const loadModels = useCallback(async (apiId: string) => {
    const api = apis.find(a => a.id === apiId);
    if (!api) return;

    if (api.features && !api.features.includes('models')) {
        setModels([]);
        setFetchError('此连接未启用“获取模型列表”功能。请手动输入模型 ID。');
        return;
    }

    setIsLoadingModels(true);
    setFetchError(null); 
    setModels([]);
    setSelectedModelIds(new Set());
    setTestResults({});
    setToolTestResults({});
    setSearchQuery('');
    setFilterOwner('all');
    
    try {
      const fetched = await fetchModels(api);
      setModels(fetched);
      showToast('success', `成功加载 ${fetched.length} 个模型`);
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      setFetchError(errorMessage); 
      showToast('error', '获取模型失败');
    } finally {
      setIsLoadingModels(false);
    }
  }, [apis]);

  useEffect(() => {
    if (selectedApiId && currentView === 'chat') loadModels(selectedApiId);
  }, [selectedApiId, loadModels, currentView]);

  // --- Handlers: Filtering & Models ---
  const filteredModels = useMemo(() => {
    return models.filter(m => {
      const lowerQuery = searchQuery.toLowerCase();
      const matchSearch = m.id.toLowerCase().includes(lowerQuery) || m.owned_by.toLowerCase().includes(lowerQuery);
      
      let matchStatus = true;
      if (filterStatus !== 'all') {
        if (activeTestMode === 'latency') {
            const result = testResults[m.id];
            if (filterStatus === 'success') matchStatus = result?.status === 'success';
            else if (filterStatus === 'error') matchStatus = result?.status === 'error';
            else if (filterStatus === 'pending') matchStatus = !result;
        } else {
            const result = toolTestResults[m.id];
            if (filterStatus === 'success') matchStatus = result?.status === 'supported';
            else if (filterStatus === 'error') matchStatus = result?.status === 'error' || result?.status === 'unsupported';
            else if (filterStatus === 'pending') matchStatus = !result;
        }
      }

      let matchOwner = true;
      if (filterOwner !== 'all') {
          matchOwner = m.owned_by === filterOwner;
      }

      return matchSearch && matchStatus && matchOwner;
    });
  }, [models, searchQuery, filterStatus, filterOwner, testResults, toolTestResults, activeTestMode]);

  const toggleModelSelection = (modelId: string) => {
    const next = new Set(selectedModelIds);
    if (next.has(modelId)) next.delete(modelId);
    else next.add(modelId);
    setSelectedModelIds(next);
  };

  const toggleAllVisibleModels = () => {
    const allFilteredSelected = filteredModels.length > 0 && filteredModels.every(m => selectedModelIds.has(m.id));
    const next = new Set(selectedModelIds);
    filteredModels.forEach(m => {
      if (allFilteredSelected) next.delete(m.id);
      else next.add(m.id);
    });
    setSelectedModelIds(next);
  };

  // --- Handlers: Export Models ---
  const handleModelExport = (type: 'all' | 'success' | 'fc' | 'report') => {
    if (models.length === 0) {
      showToast('error', '没有可导出的模型数据');
      return;
    }

    let exportList: string[] = [];
    let reportData: any[] = [];
    let filename = `models-export-${type}-${Date.now()}`;

    switch (type) {
      case 'all':
        exportList = models.map(m => m.id);
        break;
      case 'success':
        exportList = models
          .filter(m => testResults[m.id]?.status === 'success')
          .map(m => m.id);
        break;
      case 'fc':
        exportList = models
          .filter(m => toolTestResults[m.id]?.status === 'supported')
          .map(m => m.id);
        break;
      case 'report':
        reportData = models.map(m => ({
          id: m.id,
          owned_by: m.owned_by,
          latency_test: testResults[m.id] ? {
            status: testResults[m.id].status,
            latency_ms: testResults[m.id].latency,
            message: testResults[m.id].message
          } : 'not_tested',
          function_call_test: toolTestResults[m.id] ? {
            status: toolTestResults[m.id].status,
            message: toolTestResults[m.id].message
          } : 'not_tested'
        }));
        break;
    }

    if (type === 'report') {
       const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `${filename}.json`;
       a.click();
       URL.revokeObjectURL(url);
       showToast('success', '测试报告已下载');
    } else {
       if (exportList.length === 0) {
          showToast('info', '没有符合条件的模型');
          return;
       }
       navigator.clipboard.writeText(exportList.join('\n'))
         .then(() => showToast('success', `已复制 ${exportList.length} 个模型 ID`))
         .catch(() => showToast('error', '复制失败'));
    }
  };

  // --- Handlers: Testing (Latency & Tools) ---
  const handleRunClick = () => {
    setRunConfig(globalSettings); // Initialize with current global settings
    setShowRunConfigModal(true);
  };

  const handleConfirmRun = () => {
    setShowRunConfigModal(false);
    runTests(runConfig);
  };

  const runTests = async (settingsOverride?: GlobalSettings) => {
    if (!selectedApiId || selectedModelIds.size === 0) return;
    const api = apis.find(a => a.id === selectedApiId);
    if (!api) return;

    const settings = settingsOverride || globalSettings;
    const rounds = settings.testRounds || 1;
    const useStream = settings.stream ?? false;

    setIsTesting(true);
    setTestingModelIds(new Set()); // Reset running state
    const selectedModels = Array.from(selectedModelIds) as string[];
    
    // Create flattened task queue for rounds
    const queue: string[] = [];
    selectedModels.forEach(m => {
        for(let i=0; i<rounds; i++) queue.push(m);
    });

    setTestProgress({ current: 0, total: queue.length });
    
    // Temporary storage for aggregation logic during this run
    const sessionResults: Record<string, (TestResult | ToolTestResult)[]> = {};

    let completedCount = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const modelId = queue.shift();
        if (modelId) {
          // Add to running set
          setTestingModelIds(prev => {
              const next = new Set(prev);
              next.add(modelId);
              return next;
          });

          let result: TestResult | ToolTestResult;
          
          if (activeTestMode === 'latency') {
              // Pass stream setting here
              result = await testModelLatency(api, modelId, settings.testTimeout, useStream);
          } else {
              result = await testModelToolSupport(api, modelId, settings.testTimeout);
          }
          
          if (!sessionResults[modelId]) sessionResults[modelId] = [];
          sessionResults[modelId].push(result);

          // Aggregation Logic
          const modelRuns = sessionResults[modelId];
          const totalRuns = modelRuns.length; 
          const sumLatency = modelRuns.reduce((sum, r) => sum + r.latency, 0);
          const avgLatency = Math.round(sumLatency / totalRuns);
          
          let successCount = 0;
          modelRuns.forEach(r => {
             if (activeTestMode === 'latency' && (r as TestResult).status === 'success') successCount++;
             if (activeTestMode === 'tool' && (r as ToolTestResult).status === 'supported') successCount++;
          });

          const hasSuccess = successCount > 0;
          let newStatus = hasSuccess ? 'success' : 'error';
          if (activeTestMode === 'tool') newStatus = hasSuccess ? 'supported' : 'unsupported';
          if (activeTestMode === 'tool' && successCount === 0 && modelRuns.some(r => r.status === 'error')) newStatus = 'error';

          const message = `Runs: ${successCount}/${rounds} OK. Avg: ${avgLatency}ms. ${rounds > 1 ? `Last: ${result.message}` : result.message}`;

          if (activeTestMode === 'latency') {
              setTestResults(prev => ({
                  ...prev,
                  [modelId]: {
                      ...result as TestResult, 
                      latency: avgLatency, 
                      status: newStatus as 'success' | 'error',
                      message: message
                  }
              }));
          } else {
              setToolTestResults(prev => ({
                  ...prev,
                  [modelId]: {
                      ...result as ToolTestResult,
                      latency: avgLatency, 
                      status: newStatus as 'supported' | 'unsupported' | 'error',
                      message: message
                  }
              }));
          }

          completedCount++;
          setTestProgress(prev => prev ? { ...prev, current: completedCount } : null);
          
          // Remove from running set if it was the last round for this model in this specific worker context is hard to determine exactly,
          // but logically we can just remove it and if another worker picks it up it adds it back. 
          // However, simpler is just remove it. React batches updates.
          setTestingModelIds(prev => {
             // Only remove if this was the last pending task for this model? 
             // Actually, showing loading as long as *any* worker is working on it is fine.
             // But simplest UX: remove it now. If immediately re-added by another worker, it flickers or stays.
             // Given queue structure, all rounds for a model might be processed sequentially or parallel.
             // To prevent flickering we can check if queue still has this model, but queue is shared.
             // Visual flicker is acceptable or we can just remove.
             const next = new Set(prev);
             next.delete(modelId);
             return next;
          });
        }
      }
    };

    const workers = Array(Math.min(settings.testConcurrency, queue.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);

    setIsTesting(false);
    setTestingModelIds(new Set()); // Cleanup
    setTestProgress(null);
    showToast('success', `${activeTestMode === 'latency' ? '连通性' : '工具调用'}测试完成`);
  };

  // --- Chat Handlers ---
  const openChat = (modelId: string) => {
    setActiveChatModel(modelId);
    setChatMessages([]);
  };

  const addContextMessage = () => {
    setContextMessages([...contextMessages, { role: 'user', content: '' }]);
  };

  const updateContextMessage = (index: number, field: keyof ChatMessage, value: string) => {
    const updated = [...contextMessages];
    updated[index] = { ...updated[index], [field]: value };
    setContextMessages(updated);
  };

  const removeContextMessage = (index: number) => {
    const updated = contextMessages.filter((_, i) => i !== index);
    setContextMessages(updated);
  };

  const handlePromptSelect = (content: string) => {
    setContextMessages([...contextMessages, { role: 'system', content }]);
    setIsPromptLibModalOpen(false);
    showToast('success', '提示词已应用到上下文');
  };

  const initSendMessage = () => {
    if (!inputMessage.trim() || !selectedApiId || !activeChatModel) return;
    
    const validContext = contextMessages.filter(m => typeof m.content === 'string' ? m.content.trim() !== '' : true);
    const body = prepareChatBody(activeChatModel, [...validContext, ...chatMessages], chatConfig, inputMessage);

    setDebugInfo({ 
      previewBody: JSON.stringify(body, null, 2),
      actualBody: undefined,
      responseBody: undefined
    });

    if (isPreviewMode) {
      setShowDebugModal(true);
    } else {
      executeSendMessage(body);
    }
  };

  const executeSendMessage = async (body: any) => {
    const api = apis.find(a => a.id === selectedApiId);
    if (!api) return;

    const userMsgContent = body.messages[body.messages.length - 1].content;
    const userMsg: ChatMessage = { role: 'user', content: userMsgContent };
    
    setChatMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsChatting(true);
    setShowDebugModal(false); 

    try {
      let assistantMsg = '';
      const result = await sendChatMessage(api, body, (chunk) => {
        assistantMsg += chunk;
        setChatMessages(prev => {
          const last = prev[prev.length - 1];
          if (last.role === 'user') {
             return [...prev, { role: 'assistant', content: assistantMsg }];
          } else {
             return [...prev.slice(0, -1), { role: 'assistant', content: assistantMsg }];
          }
        });
      });
      
      setDebugInfo(prev => ({
        ...prev,
        actualBody: result.actualBody,
        responseBody: result.responseBody
      }));

    } catch (e) {
      const errMsg = `ERROR_BLOCK_START\n${e instanceof Error ? e.message : 'Unknown Error'}\nERROR_BLOCK_END`;
      setChatMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      showToast('error', 'API 请求出错，请查看详情');
    } finally {
      setIsChatting(false);
    }
  };

  const handleManualStart = () => {
      if(!manualModelId.trim()) { showToast('error', '请输入模型 ID'); return; }
      openChat(manualModelId);
  };

  const handleExport = async (format: 'png' | 'pdf' | 'txt') => {
    // ... existing export code ...
    if (!chatContainerRef.current) return;
    
    setShowShareModal(false);

    if (format === 'txt') {
        const text = chatMessages.map(m => {
            const role = m.role.toUpperCase();
            const content = typeof m.content === 'string' ? m.content : '[多模态内容]';
            return `${role}:\n${content}\n-------------------`;
        }).join('\n');
        
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `APICheck-Export-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    } else {
        showToast('info', '正在生成精美长图...');
        
        try {
            const exportContainer = document.createElement('div');
            exportContainer.id = 'omniprobe-export-container';
            exportContainer.style.width = '800px'; 
            exportContainer.style.padding = '40px';
            exportContainer.style.position = 'absolute';
            exportContainer.style.top = '-9999px';
            exportContainer.style.left = '-9999px';
            exportContainer.style.backgroundColor = isDark ? '#000000' : '#ffffff';
            exportContainer.style.color = isDark ? '#ffffff' : '#000000';
            exportContainer.style.fontFamily = 'Inter, sans-serif';
            
            const headerHtml = `
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; border-bottom: 1px solid ${isDark ? '#333' : '#eaeaea'}; padding-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="background: ${isDark ? '#fff' : '#000'}; color: ${isDark ? '#000' : '#fff'}; padding: 8px; border-radius: 50%;">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <div>
                    <h1 style="font-size: 24px; font-weight: 800; margin: 0; line-height: 1;">API Check</h1>
                    <p style="font-size: 12px; opacity: 0.6; margin: 4px 0 0 0;">LLM Evaluation & Observability Console</p>
                  </div>
                </div>
                <div style="text-align: right;">
                  <div style="font-family: monospace; font-size: 14px; font-weight: 600;">${activeChatModel}</div>
                  <div style="font-size: 12px; opacity: 0.5; margin-top: 4px;">${new Date().toLocaleString()}</div>
                </div>
              </div>
            `;

            const chatContent = chatContainerRef.current.cloneNode(true) as HTMLElement;
            chatContent.style.height = 'auto';
            chatContent.style.maxHeight = 'none';
            chatContent.style.overflow = 'visible';
            
            const footerHtml = `
              <div style="margin-top: 40px; border-top: 1px solid ${isDark ? '#333' : '#eaeaea'}; padding-top: 20px; text-align: center; font-size: 12px; opacity: 0.4;">
                Generated by API Check • Local LLM Testing Tool
              </div>
            `;

            exportContainer.innerHTML = headerHtml;
            exportContainer.appendChild(chatContent);
            exportContainer.insertAdjacentHTML('beforeend', footerHtml);
            
            document.body.appendChild(exportContainer);

            const canvas = await html2canvas(exportContainer, {
                useCORS: true,
                logging: false,
                scale: 2, 
                backgroundColor: isDark ? '#000000' : '#ffffff',
                windowWidth: 800
            });

            document.body.removeChild(exportContainer);

            if (format === 'png') {
                const url = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = url;
                a.download = `APICheck-${activeChatModel}-${Date.now()}.png`;
                a.click();
            } else if (format === 'pdf') {
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const pdf = new jsPDF({
                    orientation: imgHeight > imgWidth ? 'p' : 'l',
                    unit: 'px',
                    format: [imgWidth, imgHeight]
                });
                pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
                pdf.save(`APICheck-${activeChatModel}-${Date.now()}.pdf`);
            }
            showToast('success', '导出成功');
        } catch (e) {
            console.error(e);
            showToast('error', '导出失败');
        }
    }
  };

  // --- Sidebar Component ---
  const Sidebar = () => (
    <div className={`border-r border-accents-2 bg-accents-1 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-64'} hidden md:flex shrink-0 h-full`}>
      {/* Header with Toggles */}
      <div className={`border-b border-accents-2 flex items-center justify-between transition-all duration-300 ${isSidebarCollapsed ? 'p-2 flex-col gap-4' : 'p-4'}`}>
        <div className={`flex items-center gap-2 font-semibold overflow-hidden transition-all ${isSidebarCollapsed ? 'w-auto' : 'w-auto'}`}>
          <Icons.Activity className="text-foreground shrink-0" size={20} />
          <span className={`whitespace-nowrap transition-all duration-200 ${isSidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>API Check</span>
        </div>
        
        {/* Toggles moved here */}
        <div className={`flex items-center gap-1 ${isSidebarCollapsed ? 'flex-col' : ''}`}>
           {!isSidebarCollapsed && (
             <button onClick={toggleTheme} className="p-1.5 hover:bg-accents-3 rounded text-accents-5 hover:text-foreground transition-colors" title="切换主题">
                {isDark ? <Icons.Sun size={16} /> : <Icons.Moon size={16} />}
             </button>
           )}
           <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-1.5 hover:bg-accents-3 rounded text-accents-5 hover:text-foreground transition-colors hidden md:block" title={isSidebarCollapsed ? "展开" : "收起"}>
              {isSidebarCollapsed ? <Icons.PanelLeftOpen size={16} /> : <Icons.PanelLeftClose size={16} />}
           </button>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
        {/* Main Views */}
        {([
          { id: 'chat', label: '对话 / 测试', icon: Icons.Chat },
          { id: 'logs', label: '操作日志', icon: Icons.Logs },
          { id: 'bulk', label: '批量测活', icon: Icons.ListChecks },
        ] as const).map(item => (
          <button 
            key={item.id}
            onClick={() => setCurrentView(item.id)} 
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all whitespace-nowrap
              ${currentView === item.id ? 'bg-background text-foreground shadow-sm' : 'text-accents-5 hover:bg-accents-2 hover:text-foreground'}
              ${isSidebarCollapsed ? 'justify-center' : ''}`}
            title={isSidebarCollapsed ? item.label : undefined}
          >
            <item.icon size={18} className="shrink-0" />
            <span className={`transition-all duration-200 ${isSidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>{item.label}</span>
          </button>
        ))}

        <div className={`my-4 border-t border-accents-2 mx-2 transition-opacity ${isSidebarCollapsed ? 'opacity-0' : 'opacity-100'}`} />
        
        {/* Tools */}
        {([
          { id: 'prompts', label: '提示词库', icon: Icons.Library },
          { id: 'settings', label: '全局设置', icon: Icons.Settings },
          { id: 'docs', label: '使用文档', icon: Icons.Book },
        ] as const).map(item => (
          <button 
            key={item.id}
            onClick={() => setCurrentView(item.id)} 
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all whitespace-nowrap
              ${currentView === item.id ? 'bg-background text-foreground shadow-sm' : 'text-accents-5 hover:bg-accents-2 hover:text-foreground'}
              ${isSidebarCollapsed ? 'justify-center' : ''}`}
            title={isSidebarCollapsed ? item.label : undefined}
          >
            <item.icon size={18} className="shrink-0" />
            <span className={`transition-all duration-200 ${isSidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>{item.label}</span>
          </button>
        ))}

        <div className={`px-2 py-1 mt-4 text-xs font-mono text-accents-4 uppercase tracking-wider transition-opacity ${isSidebarCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>连接列表</div>
        {apis.map(api => {
          const isSelected = selectedApiId === api.id && (currentView === 'chat' || currentView === 'logs');
          return (
            <div
              key={api.id}
              onClick={() => {
                setSelectedApiId(api.id);
                if (currentView !== 'chat' && currentView !== 'logs') setCurrentView('chat');
              }}
              className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-all whitespace-nowrap relative mb-1
                ${isSelected ? 'bg-background shadow-sm text-foreground ring-1 ring-accents-2' : 'text-accents-5 hover:bg-accents-2 hover:text-foreground'}
                ${isSidebarCollapsed ? 'justify-center' : ''}`}
              title={isSidebarCollapsed ? api.name : undefined}
            >
               <div className="relative shrink-0">
                 <Icons.Server size={18} />
                 {isSelected && !isSidebarCollapsed && (
                   <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background 
                      ${connectionStatus?.type === 'success' ? 'bg-success' : 
                        connectionStatus?.type === 'error' ? 'bg-error' : 
                        connectionStatus?.type === 'loading' ? 'bg-warning animate-pulse' : 'bg-accents-4'}`} 
                   />
                 )}
               </div>

               <div className={`flex-1 overflow-hidden transition-all duration-200 flex flex-col ${isSidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
                  <span className="truncate font-medium leading-tight">{api.name}</span>
                  {isSelected && (
                     <span className={`text-[10px] truncate leading-tight mt-0.5 font-medium ${connectionStatus?.color}`}>
                       {connectionStatus?.text}
                     </span>
                  )}
               </div>

               {!isSidebarCollapsed && (
                 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 bg-gradient-to-l from-accents-1 to-transparent pl-2 z-10">
                   <button onClick={(e) => handleEditApi(e, api.id)} className="p-1.5 hover:text-foreground text-accents-4 bg-accents-1 rounded shadow-sm"><Icons.Edit size={12} /></button>
                   <button onClick={(e) => handleRemoveApi(e, api.id)} className="p-1.5 hover:text-error text-accents-4 bg-accents-1 rounded shadow-sm"><Icons.Trash size={12} /></button>
                 </div>
               )}
            </div>
          );
        })}
        
        <button 
          onClick={() => { setEditingApiId(null); setCurrentView('add_api'); }} 
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-accents-5 hover:bg-accents-2 hover:text-foreground transition-all whitespace-nowrap mt-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}
          title="添加连接"
        >
          <Icons.Plus size={18} className="shrink-0" />
          <span className={`transition-all duration-200 ${isSidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>添加连接</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Prompts Modal */}
      {isPromptLibModalOpen && (
         <PromptLibrary 
           isModal={true} 
           onClose={() => setIsPromptLibModalOpen(false)} 
           showToast={showToast}
           onSelect={handlePromptSelect}
         />
      )}

      {/* Sync Modal */}
      <AnimatePresence>
          {showSyncModal && (
              <DataSyncModal
                  onClose={() => { setShowSyncModal(false); setSyncInitialId(''); }}
                  getDataToExport={getAllDataForExport}
                  onImportData={processImportData}
                  showToast={showToast}
                  initialMode={syncInitialId ? 'receive' : 'select'}
                  initialPeerId={syncInitialId}
              />
          )}
      </AnimatePresence>

      <Sidebar />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 border-b border-accents-2 bg-background z-20 flex items-center justify-between px-4">
         <div className="font-bold flex items-center gap-2">
           <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}><Icons.Grid size={20}/></button>
           API Check
         </div>
         <div className="flex gap-4">
             <button onClick={() => { setEditingApiId(null); setCurrentView('add_api'); }}><Icons.Plus size={20} /></button>
         </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
           <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} className="fixed inset-0 z-30 bg-background md:hidden flex flex-col pt-14">
               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {[
                    { id: 'chat', label: '对话 / 测试', icon: Icons.Chat },
                    { id: 'logs', label: '操作日志', icon: Icons.Logs },
                    { id: 'bulk', label: '批量测活', icon: Icons.ListChecks },
                    { id: 'prompts', label: '提示词库', icon: Icons.Library },
                    { id: 'settings', label: '全局设置', icon: Icons.Settings },
                    { id: 'docs', label: '使用文档', icon: Icons.Book },
                  ].map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => { setCurrentView(item.id as ViewMode); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm border border-accents-2 ${currentView === item.id ? 'bg-foreground text-background' : 'bg-accents-1'}`}
                    >
                      <item.icon size={18} /> {item.label}
                    </button>
                  ))}
                  <div className="pt-4 border-t border-accents-2">
                    <div className="text-xs font-mono text-accents-4 uppercase mb-2">连接列表</div>
                    {apis.map(api => (
                       <div key={api.id} onClick={() => { setSelectedApiId(api.id); setCurrentView('chat'); setIsMobileMenuOpen(false); }} className="p-3 bg-accents-1 rounded mb-2 flex items-center gap-2 text-sm">
                          <Icons.Server size={16} /> {api.name}
                       </div>
                    ))}
                  </div>
                  <button onClick={toggleTheme} className="w-full py-3 flex justify-center border border-accents-2 rounded-lg bg-accents-1 mt-4">
                     {isDark ? '切换亮色模式' : '切换暗色模式'}
                  </button>
               </div>
               <button onClick={() => setIsMobileMenuOpen(false)} className="p-4 border-t border-accents-2 text-center text-accents-5">关闭菜单</button>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative pt-14 md:pt-0">
        
        <div className="flex-1 overflow-hidden h-full">
            {currentView === 'logs' && <div className="h-full overflow-hidden"><LogViewer /></div>}
            
            {currentView === 'bulk' && <div className="h-full overflow-hidden"><BulkTestView globalSettings={globalSettings} onImport={handleBulkImport} showToast={showToast} /></div>}

            {currentView === 'prompts' && <PromptLibrary showToast={showToast} />}
            
            {currentView === 'docs' && <Documentation isPage={true} />}

            {currentView === 'add_api' && (
                <AddApiView 
                  initialData={editingApiId ? apis.find(a => a.id === editingApiId) : null}
                  onSave={handleSaveApi}
                  onCancel={() => { setEditingApiId(null); setCurrentView('chat'); }}
                  showToast={showToast}
                />
            )}

            {currentView === 'settings' && (
               <div className="h-full overflow-y-auto w-full animate-fade-in">
                  <div className="p-4 md:p-8 max-w-2xl mx-auto min-h-full flex flex-col">
                      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Icons.Settings /> 全局设置</h1>
                      <div className="space-y-6 pb-20 flex-1">
                          <div className="p-6 border border-accents-2 rounded-lg bg-background">
                              <h3 className="font-semibold mb-4 text-lg">测试参数默认值</h3>
                              <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-accents-5 mb-1">测试超时时间 (秒)</label>
                                    <div className="relative">
                                      <Icons.Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={16} />
                                      <input type="number" min="1" max="60" className="w-full pl-9 pr-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                                        value={settingsForm.testTimeout} 
                                        onChange={(e) => setSettingsForm(prev => ({...prev, testTimeout: parseInt(e.target.value) || 15}))} />
                                    </div>
                                    <p className="text-xs text-accents-4 mt-1">单个请求的最大等待时间。超时将被视为失败。</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-accents-5 mb-1">并发数 (Max Workers)</label>
                                        <div className="relative">
                                          <Icons.Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={16} />
                                          <input type="number" min="1" max="100" className="w-full pl-9 pr-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                                            value={settingsForm.testConcurrency} 
                                            onChange={(e) => setSettingsForm(prev => ({...prev, testConcurrency: parseInt(e.target.value) || 1}))} />
                                        </div>
                                        <p className="text-[10px] text-accents-4 mt-1">控制同时发起的最大请求数量。</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-accents-5 mb-1">测试轮数 (Rounds)</label>
                                        <div className="relative">
                                          <Icons.Activity className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={16} />
                                          <input type="number" min="1" max="50" className="w-full pl-9 pr-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                                            value={settingsForm.testRounds || 1} 
                                            onChange={(e) => setSettingsForm(prev => ({...prev, testRounds: parseInt(e.target.value) || 1}))} />
                                        </div>
                                        <p className="text-[10px] text-accents-4 mt-1">每个模型重复测试的次数。</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between p-3 rounded-md bg-accents-1 border border-accents-2">
                                   <div>
                                      <span className="text-sm font-medium block">流式请求 (Stream)</span>
                                      <span className="text-xs text-accents-5">使用 SSE 流式方式进行连接测试。部分中转 API 仅支持流式。</span>
                                   </div>
                                   <Checkbox checked={settingsForm.stream} onChange={() => setSettingsForm(prev => ({...prev, stream: !prev.stream}))} />
                                </div>
                              </div>
                          </div>

                          <div className="p-6 border border-accents-2 rounded-lg bg-background">
                              <h3 className="font-semibold mb-4 text-lg">数据管理</h3>
                              
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                   <button onClick={handleExportData} className="flex items-center justify-center gap-2 px-4 py-2 bg-accents-1 border border-accents-2 rounded hover:bg-accents-2 transition-colors text-sm">
                                      <Icons.Download size={16}/> 导出配置 (JSON)
                                   </button>
                                   <div className="relative">
                                      <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        accept=".json"
                                        onChange={handleFileImport}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                      />
                                      <button className="w-full h-full flex items-center justify-center gap-2 px-4 py-2 bg-accents-1 border border-accents-2 rounded hover:bg-accents-2 transition-colors text-sm">
                                         <Icons.Import size={16}/> 导入文件
                                      </button>
                                   </div>
                                </div>

                                <div className="flex gap-2">
                                   <input 
                                     className="flex-1 px-3 py-2 bg-accents-1 border border-accents-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                                     placeholder="从 URL 导入配置..."
                                     value={importUrl}
                                     onChange={e => setImportUrl(e.target.value)}
                                   />
                                   <button onClick={handleUrlImport} className="px-4 py-2 bg-foreground text-background rounded text-sm font-medium hover:opacity-90 whitespace-nowrap">
                                      导入
                                   </button>
                                </div>

                                <button 
                                    onClick={() => setShowSyncModal(true)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-accents-3 rounded-lg hover:border-success hover:text-success hover:bg-green-50/50 transition-all text-sm font-medium"
                                >
                                    <Icons.Wifi size={16}/> 局域网 / P2P 数据互传 (扫码同步)
                                </button>
                              </div>

                              <div className="mt-8 pt-6 border-t border-accents-2">
                                 <div className="flex items-center justify-between">
                                    <div>
                                       <div className="font-semibold text-error text-sm">重置所有数据</div>
                                       <div className="text-xs text-accents-5 mt-1">清除所有连接、历史记录和设置。</div>
                                    </div>
                                    <button onClick={handleResetData} className="px-4 py-2 border border-error text-error rounded hover:bg-red-50 hover:text-red-700 transition-colors text-sm">
                                       重置数据
                                    </button>
                                 </div>
                              </div>
                          </div>
                      </div>

                      {/* Sticky Save Button Area */}
                      <div className="sticky bottom-4 z-10 flex justify-end mt-4">
                          <button 
                            onClick={handleSaveSettings}
                            className="shadow-lg px-6 py-3 bg-foreground text-background rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                          >
                             <Icons.Save size={18}/> 保存全局配置
                          </button>
                      </div>
                  </div>
               </div>
            )}

            {currentView === 'chat' && (
              <div className="h-full flex flex-col overflow-hidden">
                 {!selectedApiId ? (
                    <div className="h-full flex flex-col items-center justify-center text-accents-4">
                      <Icons.Server size={48} strokeWidth={1} className="mb-4 opacity-50" />
                      <p className="mb-2">请选择或创建一个 API 连接以开始。</p>
                      <button onClick={() => setCurrentView('docs')} className="text-sm underline hover:text-foreground">查看使用文档</button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
                          <div className="max-w-5xl mx-auto space-y-6">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                  <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-bold tracking-tight">{currentApi?.name}</h2>
                                    {/* Status Badge */}
                                    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                        connectionStatus?.type === 'success' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' :
                                        connectionStatus?.type === 'error' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' :
                                        connectionStatus?.type === 'loading' ? 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400' :
                                        connectionStatus?.type === 'manual' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400' :
                                        'bg-accents-1 border-accents-2 text-accents-5'
                                    }`}>
                                        {connectionStatus?.type === 'loading' && <Icons.Loading size={10} className="animate-spin" />}
                                        {connectionStatus?.type === 'success' && <Icons.CheckCircle size={10} />}
                                        {connectionStatus?.type === 'error' && <Icons.ErrorCircle size={10} />}
                                        {connectionStatus?.type === 'manual' && <Icons.Terminal size={10} />}
                                        {connectionStatus?.text}
                                    </div>
                                    {currentApi?.connectionMode === 'custom' && <span className="text-xs bg-accents-2 px-1.5 py-0.5 rounded text-accents-6">Custom Mode</span>}
                                  </div>
                                  <p className="text-accents-4 font-mono text-xs mt-1 truncate max-w-md flex items-center gap-2">
                                     {currentApi?.connectionMode === 'custom' ? '自定义接口' : currentApi?.baseUrl}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 self-start md:self-auto">
                                  {!isManualMode && (
                                    <button onClick={() => loadModels(selectedApiId!)} disabled={isLoadingModels} className="flex items-center gap-2 px-3 py-1.5 border border-accents-2 rounded-md text-sm hover:bg-accents-1 transition-colors">
                                      <Icons.Zap size={14} className={isLoadingModels ? "animate-spin" : ""} />
                                      {isLoadingModels ? "连接中..." : "刷新模型"}
                                    </button>
                                  )}
                                  
                                  {isManualMode ? (
                                     // Chat Only Mode Input
                                     <div className="flex gap-2">
                                        <input 
                                          className="px-3 py-1.5 border border-accents-2 rounded-md text-sm bg-background" 
                                          placeholder="输入模型 ID (如 gpt-4)"
                                          value={manualModelId}
                                          onChange={e => setManualModelId(e.target.value)}
                                        />
                                        <button onClick={handleManualStart} className="bg-foreground text-background px-3 py-1.5 rounded-md text-sm font-medium">开始对话</button>
                                     </div>
                                  ) : (
                                    // Standard Mode Test Button
                                    <button 
                                      onClick={() => {
                                        setRunConfig(globalSettings); // Reset to global defaults
                                        setShowRunConfigModal(true);
                                      }}
                                      disabled={isTesting || selectedModelIds.size === 0} 
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${selectedModelIds.size > 0 ? 'bg-foreground text-background hover:bg-accents-6' : 'bg-accents-2 text-accents-4 cursor-not-allowed'}`}
                                    >
                                      {isTesting ? <Icons.Loading className="animate-spin" size={14}/> : (activeTestMode === 'latency' ? <Icons.Play size={14} /> : <Icons.Function size={14}/>)}
                                      {isTesting ? `测试中...` : activeTestMode === 'latency' ? `运行延迟测试 (${selectedModelIds.size})` : `运行 FC 验证 (${selectedModelIds.size})`}
                                    </button>
                                  )}
                                </div>
                            </div>

                            {/* Filters & Mode Switch (Only in Standard/Model Mode) */}
                            {!isManualMode && (
                              <div className="flex flex-col sm:flex-row gap-3 items-center">
                                <div className="flex bg-accents-1 p-1 rounded-md border border-accents-2 shrink-0">
                                   <button 
                                     onClick={() => setActiveTestMode('latency')} 
                                     className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTestMode === 'latency' ? 'bg-background shadow-sm text-foreground' : 'text-accents-5 hover:text-foreground'}`}
                                   >
                                     延迟测试
                                   </button>
                                   <button 
                                     onClick={() => setActiveTestMode('tool')} 
                                     className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTestMode === 'tool' ? 'bg-background shadow-sm text-foreground' : 'text-accents-5 hover:text-foreground'}`}
                                   >
                                     FC/工具验证
                                   </button>
                                </div>
                                <div className="relative flex-1 w-full">
                                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={16} />
                                  <input 
                                    className="w-full pl-9 pr-3 py-2 bg-background border border-accents-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                                    placeholder="搜索模型 ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                  />
                                </div>
                                
                                {/* Owner Filter */}
                                <div className="relative min-w-[120px] shrink-0">
                                  <select 
                                    className="w-full pl-3 pr-8 py-2 bg-background border border-accents-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-foreground appearance-none transition-all cursor-pointer"
                                    value={filterOwner}
                                    onChange={(e) => setFilterOwner(e.target.value)}
                                  >
                                    <option value="all">所有厂商</option>
                                    {uniqueOwners.map(owner => (
                                        <option key={owner} value={owner}>{owner}</option>
                                    ))}
                                  </select>
                                  <Icons.ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-accents-4 pointer-events-none" size={14} />
                                </div>

                                <div className="relative min-w-[120px] shrink-0">
                                  <select 
                                    className="w-full pl-3 pr-8 py-2 bg-background border border-accents-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-foreground appearance-none transition-all cursor-pointer"
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value as any)}
                                  >
                                    <option value="all">全部状态</option>
                                    <option value="success">测试成功/支持</option>
                                    <option value="error">测试失败/不支持</option>
                                    <option value="pending">未测试</option>
                                  </select>
                                  <Icons.ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-accents-4 pointer-events-none" size={14} />
                                </div>
                                
                                {/* Export Actions */}
                                <div className="relative group shrink-0">
                                   <button className="flex items-center gap-1.5 px-3 py-2 bg-accents-1 border border-accents-2 rounded-md text-sm hover:bg-accents-2 transition-colors">
                                      <Icons.Download size={14} /> 导出/复制
                                      <Icons.ChevronRight size={12} className="rotate-90 ml-1 opacity-50"/>
                                   </button>
                                   <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-accents-2 rounded-md shadow-lg p-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                                      <button onClick={() => handleModelExport('all')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2">
                                        <Icons.Copy size={12}/> 复制所有模型 ID
                                      </button>
                                      <button onClick={() => handleModelExport('success')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2 text-success">
                                        <Icons.CheckCircle size={12}/> 复制可用模型 (成功)
                                      </button>
                                      <button onClick={() => handleModelExport('fc')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2 text-blue-600">
                                        <Icons.Function size={12}/> 复制 FC 支持模型
                                      </button>
                                      <div className="h-px bg-accents-2 my-1" />
                                      <button onClick={() => handleModelExport('report')} className="w-full text-left px-3 py-2 text-xs hover:bg-accents-1 rounded flex items-center gap-2">
                                        <Icons.FileText size={12}/> 导出测试报告 (JSON)
                                      </button>
                                   </div>
                                </div>
                              </div>
                            )}

                            {/* Model List (Standard Mode) */}
                            {!isManualMode && (
                              <div className="border border-accents-2 rounded-lg overflow-hidden bg-background shadow-sm">
                                  <div className="grid grid-cols-12 gap-4 p-3 border-b border-accents-2 bg-accents-1 text-xs font-medium text-accents-5 uppercase tracking-wider">
                                      <div className="col-span-2 sm:col-span-1 flex justify-center items-center">
                                        <Checkbox 
                                          checked={filteredModels.length > 0 && filteredModels.every(m => selectedModelIds.has(m.id))}
                                          onChange={toggleAllVisibleModels}
                                        />
                                      </div>
                                      <div className="col-span-7 sm:col-span-5 md:col-span-4 flex items-center">模型 ID</div>
                                      <div className="col-span-3 hidden md:flex items-center">所有者</div>
                                      <div className="hidden sm:flex col-span-3 md:col-span-2 items-center">
                                          {activeTestMode === 'latency' ? '延迟状态' : 'FC 支持状态'}
                                      </div>
                                      <div className="col-span-3 sm:col-span-3 md:col-span-2 text-right flex items-center justify-end">操作</div>
                                  </div>
                                  <div>
                                    {fetchError ? (
                                      <div className="p-8 flex flex-col items-center justify-center text-error animate-fade-in">
                                          <Icons.ErrorCircle size={48} className="mb-4 opacity-50" />
                                          <h3 className="font-bold text-lg mb-2">无法获取模型</h3>
                                          <p className="text-sm text-accents-5 mb-4">{fetchError}</p>
                                          <button onClick={() => loadModels(selectedApiId!)} className="px-4 py-2 bg-accents-2 hover:bg-accents-3 rounded text-sm text-foreground flex items-center gap-2">
                                            <Icons.Zap size={14} /> 重试
                                          </button>
                                      </div>
                                    ) : isLoadingModels ? (
                                      <div className="p-12 flex justify-center text-accents-4"><Icons.Loading className="animate-spin" size={24} /></div>
                                    ) : filteredModels.length === 0 ? (
                                      <div className="p-12 text-center text-accents-4 text-sm">
                                        {models.length === 0 ? "暂无数据" : "没有匹配的模型"}
                                      </div>
                                    ) : (
                                        filteredModels.map(model => {
                                          const latResult = testResults[model.id];
                                          const toolResult = toolTestResults[model.id];
                                          const showTool = activeTestMode === 'tool';
                                          const isModelLoading = testingModelIds.has(model.id);
                                          
                                          return (
                                            <div key={model.id} className="grid grid-cols-12 gap-4 p-3 items-center border-b border-accents-2 last:border-0 hover:bg-accents-1 transition-colors text-sm group">
                                                <div className="col-span-2 sm:col-span-1 flex justify-center">
                                                  <Checkbox 
                                                    checked={selectedModelIds.has(model.id)}
                                                    onChange={() => toggleModelSelection(model.id)}
                                                  />
                                                </div>
                                                <div className="col-span-7 sm:col-span-5 md:col-span-4 font-mono truncate select-all" title={model.id}>{model.id}</div>
                                                <div className="col-span-3 hidden md:block text-accents-5 truncate">{model.owned_by}</div>
                                                
                                                {/* Status Column */}
                                                <div className="col-span-3 sm:col-span-3 md:col-span-2 min-h-[24px] flex items-center">
                                                  {isModelLoading ? (
                                                      <div className="flex items-center gap-2 text-accents-4">
                                                          <Icons.Loading className="animate-spin" size={14} />
                                                          <span className="text-xs">Testing...</span>
                                                      </div>
                                                  ) : !showTool ? (
                                                      latResult ? (
                                                        <div 
                                                          onClick={(e) => { e.stopPropagation(); setSelectedTestResult(latResult); }}
                                                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${latResult.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                                                        >
                                                          {latResult.status === 'success' ? <Icons.CheckCircle size={12} /> : <Icons.ErrorCircle size={12} />}
                                                          {latResult.status === 'success' ? `${latResult.latency}ms` : '错误'}
                                                        </div>
                                                      ) : <span className="text-accents-3 text-xs">–</span>
                                                  ) : (
                                                      toolResult ? (
                                                        <button onClick={() => setSelectedToolResult(toolResult)} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity ${toolResult.status === 'supported' ? 'bg-blue-100 text-blue-700' : toolResult.status === 'unsupported' ? 'bg-accents-2 text-accents-6' : 'bg-red-100 text-red-700'}`}>
                                                          {toolResult.status === 'supported' ? <Icons.Function size={12} /> : toolResult.status === 'unsupported' ? <Icons.X size={12}/> : <Icons.ErrorCircle size={12} />}
                                                          {toolResult.status === 'supported' ? '支持' : toolResult.status === 'unsupported' ? '不支持' : '错误'}
                                                        </button>
                                                      ) : <span className="text-accents-3 text-xs">–</span>
                                                  )}
                                                </div>

                                                <div className="col-span-3 sm:col-span-3 md:col-span-2 text-right flex justify-end items-center gap-2">
                                                  <button onClick={() => openChat(model.id)} className="text-accents-5 hover:text-foreground transition-colors p-1" title="对话测试">
                                                    <Icons.Chat size={16} />
                                                  </button>
                                                </div>
                                            </div>
                                          );
                                        })
                                    )}
                                  </div>
                              </div>
                            )}
                          </div>
                      </div>
                    </div>
                  )}
              </div>
            )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-sm rounded-xl shadow-2xl overflow-hidden border border-accents-2">
                    <div className="p-6">
                        <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                            {confirmModal.isDanger ? <Icons.ErrorCircle className="text-error" /> : <Icons.Info />}
                            {confirmModal.title}
                        </h3>
                        <p className="text-sm text-accents-5 leading-relaxed">{confirmModal.message}</p>
                    </div>
                    <div className="p-4 border-t border-accents-2 bg-accents-1 flex justify-end gap-3">
                        <button 
                            onClick={() => setConfirmModal(prev => ({...prev, isOpen: false}))} 
                            className="px-4 py-2 text-sm text-accents-5 hover:text-foreground"
                        >
                            取消
                        </button>
                        <button 
                            onClick={confirmModal.onConfirm} 
                            className={`px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 ${confirmModal.isDanger ? 'bg-error text-white' : 'bg-foreground text-background'}`}
                        >
                            {confirmModal.confirmText || '确定'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Run Config Modal */}
      <AnimatePresence>
        {showRunConfigModal && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-sm rounded-xl shadow-2xl overflow-hidden border border-accents-2 flex flex-col">
                <div className="p-4 border-b border-accents-2 font-semibold flex justify-between items-center bg-accents-1">
                  <span className="flex items-center gap-2">
                    <Icons.Settings size={18} /> 配置测试参数
                  </span>
                  <button onClick={() => setShowRunConfigModal(false)}><Icons.X size={18} /></button>
                </div>
                <div className="p-6 space-y-4">
                   <div>
                       <label className="block text-sm font-medium text-accents-5 mb-1">测试并发数 (Max Workers)</label>
                       <div className="relative">
                          <Icons.Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={16} />
                          <input type="number" min="1" max="100" className="w-full pl-9 pr-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                             value={runConfig.testConcurrency} 
                             onChange={(e) => setRunConfig(prev => ({...prev, testConcurrency: parseInt(e.target.value) || 1}))} 
                          />
                       </div>
                       <div className="text-[10px] text-accents-4 mt-1">控制同时发起的最大请求数量。</div>
                   </div>
                   <div>
                       <label className="block text-sm font-medium text-accents-5 mb-1">测试轮数 (Rounds per Model)</label>
                       <div className="relative">
                          <Icons.Activity className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={16} />
                          <input type="number" min="1" max="50" className="w-full pl-9 pr-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                             value={runConfig.testRounds || 1} 
                             onChange={(e) => setRunConfig(prev => ({...prev, testRounds: parseInt(e.target.value) || 1}))} 
                          />
                       </div>
                       <div className="text-[10px] text-accents-4 mt-1">每个选中的模型重复测试的次数。</div>
                   </div>
                   <div>
                       <label className="block text-sm font-medium text-accents-5 mb-1">测试超时时间 (秒)</label>
                       <div className="relative">
                          <Icons.Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-accents-4" size={16} />
                          <input type="number" min="1" max="60" className="w-full pl-9 pr-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground transition-all"
                             value={runConfig.testTimeout} 
                             onChange={(e) => setRunConfig(prev => ({...prev, testTimeout: parseInt(e.target.value) || 15}))} 
                          />
                       </div>
                   </div>
                   <div className="flex items-center justify-between p-2 rounded bg-accents-1 border border-accents-2">
                       <div>
                          <span className="text-sm font-medium block">流式请求</span>
                          <span className="text-[10px] text-accents-5">使用 SSE 模式连接</span>
                       </div>
                       <Checkbox checked={runConfig.stream} onChange={() => setRunConfig(prev => ({...prev, stream: !prev.stream}))} />
                   </div>
                   <div className="text-xs text-accents-4 bg-accents-1 p-2 rounded border border-accents-2">
                       提示：此次修改仅对本轮测试生效，不会覆盖全局设置。
                   </div>
                </div>
                <div className="p-4 border-t border-accents-2 bg-background flex justify-end gap-3">
                   <button onClick={() => setShowRunConfigModal(false)} className="px-4 py-2 text-sm text-accents-5 hover:text-foreground">取消</button>
                   <button 
                     onClick={handleConfirmRun} 
                     className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-2"
                   >
                     <Icons.Play size={14} /> 开始测试
                   </button>
                </div>
             </motion.div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Latency Test Details Modal */}
      <AnimatePresence>
        {selectedTestResult && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-2xl max-h-[80vh] rounded-xl shadow-2xl overflow-hidden border border-accents-2 flex flex-col">
                <div className="p-4 border-b border-accents-2 font-semibold flex justify-between items-center bg-accents-1">
                  <span className="flex items-center gap-2">
                    <Icons.Activity size={18} /> 延迟测试详情: <span className="font-mono text-sm">{selectedTestResult.modelId}</span>
                  </span>
                  <button onClick={() => setSelectedTestResult(null)}><Icons.X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-accents-1 rounded border border-accents-2">
                         <div className="text-xs text-accents-5 uppercase mb-1">测试结果</div>
                         <div className={`font-bold flex items-center gap-2 ${selectedTestResult.status === 'success' ? 'text-success' : 'text-error'}`}>
                            {selectedTestResult.status === 'success' ? <Icons.CheckCircle size={16}/> : <Icons.ErrorCircle size={16}/>}
                            {selectedTestResult.status === 'success' ? 'Success' : 'Failed'}
                         </div>
                      </div>
                      <div className="p-3 bg-accents-1 rounded border border-accents-2">
                         <div className="text-xs text-accents-5 uppercase mb-1">响应延迟</div>
                         <div className="font-mono">{selectedTestResult.latency} ms</div>
                      </div>
                      {selectedTestResult.statusCode && (
                          <div className="p-3 bg-accents-1 rounded border border-accents-2">
                             <div className="text-xs text-accents-5 uppercase mb-1">HTTP Status</div>
                             <div className="font-mono">{selectedTestResult.statusCode}</div>
                          </div>
                      )}
                      <div className="p-3 bg-accents-1 rounded border border-accents-2">
                         <div className="text-xs text-accents-5 uppercase mb-1">Timestamp</div>
                         <div className="font-mono text-xs">{new Date(selectedTestResult.timestamp).toLocaleTimeString()}</div>
                      </div>
                   </div>
                   
                   {selectedTestResult.message && (
                     <div className="text-sm p-2 bg-accents-1 border border-accents-2 rounded text-accents-6">
                        {selectedTestResult.message}
                     </div>
                   )}

                   {selectedTestResult.requestBody && (
                       <div>
                          <h4 className="text-xs font-bold uppercase text-accents-5 mb-2">Request Body</h4>
                          <pre className="bg-accents-1 border border-accents-2 rounded-lg p-3 text-xs font-mono overflow-x-auto text-accents-6">
                             {JSON.stringify(selectedTestResult.requestBody, null, 2)}
                          </pre>
                       </div>
                   )}

                   {selectedTestResult.responseBody && (
                       <div>
                          <h4 className="text-xs font-bold uppercase text-accents-5 mb-2">Response Body</h4>
                          <pre className={`bg-accents-1 border border-accents-2 rounded-lg p-3 text-xs font-mono overflow-x-auto ${selectedTestResult.status === 'error' ? 'text-error' : 'text-accents-6'}`}>
                             {typeof selectedTestResult.responseBody === 'string' 
                                ? selectedTestResult.responseBody 
                                : JSON.stringify(selectedTestResult.responseBody, null, 2)}
                          </pre>
                       </div>
                   )}
                </div>
             </motion.div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Tool Details Modal */}
      <AnimatePresence>
        {selectedToolResult && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-2xl max-h-[80vh] rounded-xl shadow-2xl overflow-hidden border border-accents-2 flex flex-col">
                <div className="p-4 border-b border-accents-2 font-semibold flex justify-between items-center bg-accents-1">
                  <span className="flex items-center gap-2">
                    <Icons.Function size={18} /> FC 验证详情: <span className="font-mono text-sm">{selectedToolResult.modelId}</span>
                  </span>
                  <button onClick={() => setSelectedToolResult(null)}><Icons.X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-accents-1 rounded border border-accents-2">
                         <div className="text-xs text-accents-5 uppercase mb-1">测试结果</div>
                         <div className={`font-bold ${selectedToolResult.status === 'supported' ? 'text-success' : 'text-error'}`}>
                            {selectedToolResult.status === 'supported' ? '✅ 支持 Function Calling' : selectedToolResult.status === 'unsupported' ? '⚠️ 不支持 (未返回工具调用)' : '❌ 请求错误'}
                         </div>
                      </div>
                      <div className="p-3 bg-accents-1 rounded border border-accents-2">
                         <div className="text-xs text-accents-5 uppercase mb-1">响应延迟</div>
                         <div className="font-mono">{selectedToolResult.latency} ms</div>
                      </div>
                   </div>
                   
                   {selectedToolResult.message && (
                     <div className="text-sm p-2 bg-accents-1 border border-accents-2 rounded text-accents-6">
                        {selectedToolResult.message}
                     </div>
                   )}

                   <div>
                      <h4 className="text-xs font-bold uppercase text-accents-5 mb-2">Request Body (Tools Definition)</h4>
                      <pre className="bg-accents-1 border border-accents-2 rounded-lg p-3 text-xs font-mono overflow-x-auto text-accents-6">
                         {JSON.stringify(selectedToolResult.requestBody, null, 2)}
                      </pre>
                   </div>

                   <div>
                      <h4 className="text-xs font-bold uppercase text-accents-5 mb-2">Response Body</h4>
                      <pre className="bg-accents-1 border border-accents-2 rounded-lg p-3 text-xs font-mono overflow-x-auto text-accents-6">
                         {typeof selectedToolResult.responseBody === 'string' 
                            ? selectedToolResult.responseBody 
                            : JSON.stringify(selectedToolResult.responseBody, null, 2)}
                      </pre>
                   </div>
                </div>
             </motion.div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* ... Share Modal ... */}
      <AnimatePresence>
        {showShareModal && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-sm rounded-xl shadow-2xl overflow-hidden border border-accents-2">
                <div className="p-4 border-b border-accents-2 font-semibold flex justify-between items-center bg-accents-1">
                  <span className="flex items-center gap-2"><Icons.Share size={18} /> 导出 / 分享</span>
                  <button onClick={() => setShowShareModal(false)}><Icons.X size={18} /></button>
                </div>
                <div className="p-2">
                   <button onClick={() => handleExport('png')} className="w-full flex items-center gap-3 p-3 hover:bg-accents-1 rounded-md transition-colors text-left">
                      <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Icons.Image size={20} /></div>
                      <div>
                        <div className="font-medium text-sm">导出图片 (PNG)</div>
                        <div className="text-xs text-accents-5">生成带水印的长截图，适合分享社交媒体</div>
                      </div>
                   </button>
                   <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-3 p-3 hover:bg-accents-1 rounded-md transition-colors text-left">
                      <div className="p-2 bg-red-100 text-red-600 rounded-lg"><Icons.FileImage size={20} /></div>
                      <div>
                        <div className="font-medium text-sm">导出文档 (PDF)</div>
                        <div className="text-xs text-accents-5">适合存档保存</div>
                      </div>
                   </button>
                   <button onClick={() => handleExport('txt')} className="w-full flex items-center gap-3 p-3 hover:bg-accents-1 rounded-md transition-colors text-left">
                      <div className="p-2 bg-gray-100 text-gray-600 rounded-lg"><Icons.FileText size={20} /></div>
                      <div>
                        <div className="font-medium text-sm">导出文本 (TXT)</div>
                        <div className="text-xs text-accents-5">纯文本格式，无样式</div>
                      </div>
                   </button>
                </div>
             </motion.div>
           </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {/* ... Debug Modal ... */}
        {showDebugModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex flex-col border border-accents-2 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-accents-2 bg-accents-1">
                 <div className="flex items-center gap-2 font-semibold">
                   <Icons.Code size={20} />
                   调试 / 预览请求
                 </div>
                 <button onClick={() => setShowDebugModal(false)}><Icons.X size={20}/></button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                 <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-accents-2 h-1/2 md:h-full">
                    <div className="p-2 bg-accents-1 text-xs font-mono font-bold text-accents-5 border-b border-accents-2 flex justify-between items-center">
                       <span>预览请求体 (可编辑)</span>
                       <span className="text-[10px] text-warning bg-warning/10 px-2 rounded">编辑后点击下方发送生效</span>
                    </div>
                    <textarea 
                      className="flex-1 w-full p-4 font-mono text-xs bg-background resize-none focus:outline-none"
                      value={debugInfo.previewBody}
                      onChange={(e) => setDebugInfo({...debugInfo, previewBody: e.target.value})}
                    />
                 </div>
                 <div className="flex-1 flex flex-col h-1/2 md:h-full overflow-hidden">
                    <div className="flex-1 flex flex-col min-h-0 border-b border-accents-2">
                      <div className="p-2 bg-accents-1 text-xs font-mono font-bold text-accents-5 border-b border-accents-2">实际发送 (上次)</div>
                      <pre className="flex-1 p-4 font-mono text-xs overflow-auto text-accents-6">{debugInfo.actualBody || '等待请求...'}</pre>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="p-2 bg-accents-1 text-xs font-mono font-bold text-accents-5 border-b border-accents-2">响应体 (上次)</div>
                      <pre className="flex-1 p-4 font-mono text-xs overflow-auto text-accents-6">{debugInfo.responseBody || '等待响应...'}</pre>
                    </div>
                 </div>
              </div>
              <div className="p-4 border-t border-accents-2 flex justify-end gap-3 bg-accents-1">
                 <button onClick={() => setShowDebugModal(false)} className="px-4 py-2 text-sm text-accents-5 hover:text-foreground">关闭</button>
                 <button 
                   onClick={() => {
                      try {
                        const body = JSON.parse(debugInfo.previewBody);
                        executeSendMessage(body);
                      } catch(e) {
                        showToast('error', 'JSON 格式错误，请检查');
                      }
                   }} 
                   className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-2"
                 >
                   <Icons.Zap size={14} /> 确认并发送
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Drawer */}
      <AnimatePresence>
        {activeChatModel && (
          <motion.div 
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full md:w-[600px] bg-background border-l border-accents-2 shadow-2xl z-40 flex flex-col"
          >
            {/* ... Keep Chat Drawer content ... */}
            <div className="h-14 border-b border-accents-2 flex items-center justify-between px-4 bg-background/80 backdrop-blur shrink-0 z-10">
               <div className="flex items-center gap-2">
                 <button onClick={() => setActiveChatModel(null)} className="p-1 hover:bg-accents-2 rounded-md"><Icons.ArrowRight className="rotate-180" size={16} /></button>
                 <span className="font-mono text-sm font-semibold truncate max-w-[150px] md:max-w-none">{activeChatModel}</span>
               </div>
               <div className="flex items-center gap-2">
                 <button onClick={() => setShowShareModal(true)} className="p-1.5 hover:bg-accents-2 rounded-md text-accents-5" title="分享 / 导出"><Icons.Share size={16} /></button>
                 <button onClick={() => setShowParams(!showParams)} className={`p-1.5 rounded-md transition-colors ${showParams ? 'bg-foreground text-background' : 'hover:bg-accents-2 text-accents-5'}`} title="参数设置"><Icons.Sliders size={16} /></button>
                 <button onClick={() => setShowDebugModal(true)} className="p-1.5 hover:bg-accents-2 rounded-md text-accents-5" title="查看上次请求/响应"><Icons.Code size={16} /></button>
               </div>
            </div>

            {/* Parameters Panel */}
            <AnimatePresence>
              {showParams && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-accents-2 bg-background overflow-hidden shrink-0">
                  <div className="p-4 grid grid-cols-2 gap-4 text-xs">
                     <div className="col-span-2 flex items-center justify-between p-2 border border-accents-2 rounded bg-accents-1">
                        <span className="font-medium">流式输出 (Stream)</span>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setChatConfig(c => ({...c, stream: !c.stream}))}>
                           <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${chatConfig.stream ? 'bg-success' : 'bg-accents-3'}`}>
                             <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${chatConfig.stream ? 'translate-x-4' : 'translate-x-0'}`} />
                           </div>
                        </div>
                     </div>
                     <div className="col-span-2 space-y-2 p-2 border border-accents-2 rounded bg-accents-1">
                        <div className="flex items-center justify-between">
                           <span className="font-medium flex items-center gap-1"><Icons.Image size={12}/> 多模态/图片</span>
                           <Checkbox checked={chatConfig.enableImage} onChange={() => setChatConfig(c => ({...c, enableImage: !c.enableImage}))} />
                        </div>
                        {chatConfig.enableImage && (
                          <input className="w-full bg-background border border-accents-2 rounded px-2 py-1 focus:outline-none" placeholder="输入本地/远程图片链接..." value={chatConfig.imageUrl} onChange={(e) => setChatConfig(c => ({...c, imageUrl: e.target.value}))} />
                        )}
                     </div>
                     <div className="space-y-1">
                        <div className="flex justify-between"><span>Temperature</span> <span className="font-mono text-accents-5">{chatConfig.temperature}</span></div>
                        <input type="range" min="0" max="2" step="0.1" value={chatConfig.temperature} onChange={(e) => setChatConfig(c => ({...c, temperature: parseFloat(e.target.value)}))} className="w-full accent-foreground" />
                     </div>
                     <div className="space-y-1">
                        <div className="flex justify-between"><span>Top P</span> <span className="font-mono text-accents-5">{chatConfig.top_p}</span></div>
                        <input type="range" min="0" max="1" step="0.05" value={chatConfig.top_p} onChange={(e) => setChatConfig(c => ({...c, top_p: parseFloat(e.target.value)}))} className="w-full accent-foreground" />
                     </div>
                     <div className="col-span-2 flex gap-4">
                       <div className="flex-1 space-y-1">
                          <label>Max Tokens</label>
                          <input type="number" value={chatConfig.max_tokens} onChange={e => setChatConfig(c => ({...c, max_tokens: parseInt(e.target.value)}))} className="w-full bg-accents-1 border border-accents-2 rounded px-2 py-1" />
                       </div>
                       <div className="flex-1 space-y-1">
                          <label>Seed (Optional)</label>
                          <input type="number" placeholder="Random" value={chatConfig.seed ?? ''} onChange={e => setChatConfig(c => ({...c, seed: e.target.value ? parseInt(e.target.value) : undefined}))} className="w-full bg-accents-1 border border-accents-2 rounded px-2 py-1" />
                       </div>
                     </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Context Config */}
            <div className="border-b border-accents-2 bg-accents-1 max-h-[25vh] overflow-y-auto shrink-0">
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                   <h4 className="text-xs font-medium text-accents-5 uppercase tracking-wider">上下文设置 (System/Context)</h4>
                   <div className="flex gap-2">
                      <button onClick={() => { setIsPromptLibModalOpen(true); }} className="text-xs flex items-center gap-1 text-accents-5 hover:text-foreground transition-colors px-2 py-1 bg-background border border-accents-2 rounded">
                        <Icons.Library size={12} /> 从库中选择
                      </button>
                      <button onClick={addContextMessage} className="text-xs flex items-center gap-1 text-accents-5 hover:text-foreground transition-colors px-2 py-1 bg-background border border-accents-2 rounded">
                        <Icons.Plus size={12} /> 添加
                      </button>
                   </div>
                </div>
                <div className="space-y-2">
                  {contextMessages.map((msg, idx) => (
                    <div key={idx} className="flex flex-col gap-1 bg-background border border-accents-2 rounded-md p-2 relative group">
                       <div className="flex justify-between items-center mb-1">
                          <select value={msg.role} onChange={(e) => updateContextMessage(idx, 'role', e.target.value as any)} className="text-xs bg-accents-1 border border-accents-2 rounded px-1 py-0.5 focus:outline-none">
                            <option value="system">System</option>
                            <option value="user">User</option>
                            <option value="assistant">Assistant</option>
                          </select>
                          <button onClick={() => removeContextMessage(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity text-accents-4 hover:text-error p-1"><Icons.X size={12} /></button>
                       </div>
                       <textarea value={typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)} onChange={(e) => updateContextMessage(idx, 'content', e.target.value)} className="w-full text-sm bg-transparent border-0 focus:ring-0 resize-none min-h-[40px] p-0 font-mono text-accents-6" placeholder="输入上下文内容..." />
                    </div>
                  ))}
                  {contextMessages.length === 0 && <div className="text-xs text-accents-4 text-center py-2">暂无上下文，模型将基于默认行为回答。</div>}
                </div>
              </div>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background" ref={chatContainerRef} data-chat-container>
               {chatMessages.length === 0 && (
                 <div className="text-center text-accents-4 text-sm mt-10 flex flex-col items-center">
                   <Icons.Chat size={32} className="mb-2 opacity-20" />
                   配置好参数与上下文，发送消息开始测试。
                 </div>
               )}
               {chatMessages.map((msg, i) => {
                 const isError = typeof msg.content === 'string' && msg.content.startsWith('ERROR_BLOCK_START');
                 const displayContent = isError ? (msg.content as string).replace('ERROR_BLOCK_START\n', '').replace('\nERROR_BLOCK_END', '') : (typeof msg.content === 'string' ? msg.content : '[多模态内容]');
                 return (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[95%] md:max-w-[85%] rounded-lg px-4 py-2 text-sm shadow-sm overflow-hidden ${isError ? 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200 w-full font-mono whitespace-pre-wrap' : msg.role === 'user' ? 'bg-foreground text-background' : 'bg-accents-1 border border-accents-2 text-foreground'}`}>
                         {isError ? (
                           <>
                             <div className="flex items-center gap-2 mb-2 font-bold"><Icons.ErrorCircle size={14}/> Error Details</div>
                             {displayContent}
                           </>
                         ) : (<div className="markdown-body"><ReactMarkdown>{displayContent}</ReactMarkdown></div>)}
                      </div>
                  </div>
                 );
               })}
               {isChatting && (
                 <div className="flex justify-start">
                   <div className="bg-accents-1 border border-accents-2 rounded-lg px-4 py-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-accents-4 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-accents-4 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-accents-4 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
                 </div>
               )}
               <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-accents-2 bg-background shrink-0">
               <form onSubmit={(e) => { e.preventDefault(); initSendMessage(); }} className="relative flex items-end gap-2 p-2 rounded-xl border border-accents-2 bg-accents-1 focus-within:border-accents-5 focus-within:shadow-md transition-all duration-200">
                  <textarea className="w-full bg-transparent border-none focus:ring-0 resize-none min-h-[44px] max-h-[200px] py-3 pl-3 pr-20 text-sm placeholder:text-accents-4"
                     placeholder={isPreviewMode ? "输入内容 -> 点击预览..." : "在此输入测试消息..."}
                     value={inputMessage} onChange={(e) => setInputMessage(e.target.value)}
                     onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); initSendMessage(); } }}
                     disabled={isChatting} />
                  
                  <div className="absolute right-2 bottom-2 flex items-center gap-1">
                     <button type="button" onClick={() => setIsPreviewMode(!isPreviewMode)} className={`p-2 rounded-lg transition-colors ${isPreviewMode ? 'text-warning bg-warning/10' : 'text-accents-4 hover:bg-accents-2 hover:text-foreground'}`} title={isPreviewMode ? "预览模式开启: 发送前将弹出JSON预览" : "开启预览模式"}>
                        {isPreviewMode ? <Icons.Eye size={20} /> : <Icons.EyeOff size={20} />}
                     </button>
                     <button type="submit" disabled={isChatting || !inputMessage.trim()} className="p-2 bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm">
                        <Icons.ArrowUp size={20} strokeWidth={2.5} />
                     </button>
                  </div>
               </form>
               <div className="text-center text-[10px] text-accents-4 mt-2 font-mono">API Check Console</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};