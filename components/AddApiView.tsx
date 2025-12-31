import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import { ApiConfig } from '../types';
import { Checkbox } from './ui/Checkbox';
import { fetchModels, testModelLatency } from '../services/llmService';

interface AddApiViewProps {
  initialData?: ApiConfig | null;
  onSave: (config: ApiConfig) => void;
  onCancel: () => void;
  showToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type Tab = 'standard' | 'advanced' | 'curl';

// --- Preset Providers Data ---
const PROVIDERS = [
  {
    category: '国内精选',
    items: [
      { name: 'DeepSeek', url: 'https://api.deepseek.com', desc: '深度求索，国产之光' },
      { name: 'SiliconFlow', url: 'https://api.siliconflow.cn', desc: '硅基流动，聚合开源模型' },
      { name: 'Aliyun Bailian', url: 'https://dashscope.aliyuncs.com/compatible-mode', desc: '阿里云百炼，通义千问系列' },
      { name: 'Zhipu AI', url: 'https://open.bigmodel.cn/api/paas/v4', desc: '智谱 AI，GLM 系列', noV1: true },
      { name: 'Moonshot', url: 'https://api.moonshot.ai', desc: '月之暗面，Kimi 长文本' },
    ]
  },
  {
    category: '国际 / 海外',
    items: [
      { name: 'OpenAI', url: 'https://api.openai.com', desc: 'GPT 系列，行业标准' },
      { name: 'OpenRouter', url: 'https://openrouter.ai/api', desc: '聚合数百模型，统一路由' },
      { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', desc: 'Gemini 系列，OpenAI 兼容层', noV1: true },
      { name: 'Groq', url: 'https://api.groq.com/openai', desc: 'Llama/Mixtral 极致推理速度' },
      { name: 'xAI', url: 'https://api.x.ai', desc: 'Grok 系列' },
      { name: 'Together AI', url: 'https://api.together.xyz', desc: '开源模型聚合' },
      { name: 'Fireworks AI', url: 'https://api.fireworks.ai/inference', desc: '高速推理平台' },
      { name: 'Mistral AI', url: 'https://api.mistral.ai', desc: '欧洲最强开源模型' },
      { name: 'Novita AI', url: 'https://api.novita.ai/openai', desc: '支持 DeepSeek/Minimax' },
    ]
  }
];

const DEFAULT_SMART_FILL_PROMPT = `你是一位精通 API 配置的专家。你的任务是从用户提供的杂乱文本中提取 API 连接信息。

请提取以下字段并以纯 JSON 格式返回：
1. "name": 根据 Base URL 自动生成一个简洁的连接名称（中文或英文，如 "DeepSeek", "OpenAI", "My Proxy"）。
2. "baseUrl": API 的接口地址。
3. "apiKey": API 密钥（通常以 sk- 开头）。
4. "customHeaders": 如果文本中包含特定的 Header（如 X-Custom-Auth, cf-access-token 等），请提取为键值对对象。
5. "customParams": 如果文本中包含特定的 Body 参数（如 model_version, system_fingerprint），请提取为键值对对象。

规则：
1. 仅返回 JSON 对象，不要包含 markdown 代码块或其他解释文字。
2. 如果某个字段未找到，请设为 null 或空对象。
3. 如果 Base URL 是 OpenAI 兼容接口但缺少 /v1，且域名不是根域名，请保持原样；如果是根域名（如 api.openai.com），通常补全 /v1。

示例输入: "用这个 key sk-123 访问 https://api.example.com，记得加个 Header X-Org-ID: 999"
示例输出: {
  "name": "Example API",
  "baseUrl": "https://api.example.com",
  "apiKey": "sk-123",
  "customHeaders": { "X-Org-ID": "999" },
  "customParams": {}
}`;

export const AddApiView: React.FC<AddApiViewProps> = ({ initialData, onSave, onCancel, showToast }) => {
  const [activeTab, setActiveTab] = useState<Tab>('standard');
  
  // Basic
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [autoV1, setAutoV1] = useState(true);
  
  // Features
  const [enableChat, setEnableChat] = useState(true);
  const [enableModels, setEnableModels] = useState(true);

  // Advanced
  const [modelsEndpoint, setModelsEndpoint] = useState('');
  const [chatEndpoint, setChatEndpoint] = useState('');
  const [customHeaders, setCustomHeaders] = useState<{key: string, value: string}[]>([]);
  const [customParams, setCustomParams] = useState<{key: string, value: string}[]>([]); 

  // cURL Import
  const [curlInput, setCurlInput] = useState('');
  const [curlResult, setCurlResult] = useState<{ status: number; headers: any; body: string } | null>(null);
  const [isCurlRunning, setIsCurlRunning] = useState(false);

  // Smart Fill State
  const [showSmartFill, setShowSmartFill] = useState(false);
  const [smartFillText, setSmartFillText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [smartFillConfig, setSmartFillConfig] = useState({
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    model: 'Qwen/Qwen2.5-32B-Instruct',
    prompt: DEFAULT_SMART_FILL_PROMPT
  });
  const [showSmartFillConfig, setShowSmartFillConfig] = useState(false);

  // Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; title: string; content: any } | null>(null);

  // Modal State
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setApiKey(initialData.apiKey);
      setBaseUrl(initialData.baseUrl);
      setAutoV1(initialData.autoV1 ?? true);
      setEnableChat(initialData.features?.includes('chat') ?? true);
      setEnableModels(initialData.features?.includes('models') ?? true);
      
      if (initialData.connectionMode === 'custom') {
        setActiveTab('advanced');
        setModelsEndpoint(initialData.modelsEndpoint || '');
        setChatEndpoint(initialData.chatEndpoint || '');
      }

      if (initialData.customHeaders) {
        setCustomHeaders(Object.entries(initialData.customHeaders).map(([k, v]) => ({ key: k, value: v })));
      }
      if (initialData.customParams) {
        setCustomParams(Object.entries(initialData.customParams).map(([k, v]) => ({ key: k, value: String(v) })));
      }
    }

    // Load Smart Fill Config
    const savedSmartConfig = localStorage.getItem('omni_smart_fill_config');
    if (savedSmartConfig) {
      try {
        const parsed = JSON.parse(savedSmartConfig);
        // Ensure prompt is updated to new default if user hasn't heavily customized it (simple check) or if it's the old English one
        if (parsed.prompt && parsed.prompt.includes("You are an expert")) {
             parsed.prompt = DEFAULT_SMART_FILL_PROMPT;
        }
        setSmartFillConfig(parsed);
      } catch {}
    }
  }, [initialData]);

  const handleSelectPreset = (provider: typeof PROVIDERS[0]['items'][0]) => {
      setName(provider.name);
      setBaseUrl(provider.url);
      setAutoV1(!provider.noV1); // If provider says noV1 (like Gemini sometimes), disable autoV1
      setShowPresets(false);
      showToast('success', `已应用 ${provider.name} 配置`);
  };

  const handleRunCurl = async () => {
    if (!curlInput.trim()) {
        showToast('error', '请输入 cURL 命令');
        return;
    }

    setIsCurlRunning(true);
    setCurlResult(null);

    try {
        let url = '';
        let method = 'GET';
        const headers: Record<string, string> = {};
        let body: string | undefined = undefined;

        // 1. Extract URL
        const urlMatch = curlInput.match(/curl\s+(?:-X\s+\w+\s+)?(?:--location\s+)?['"]?([^'"\s]+)/);
        if(urlMatch) url = urlMatch[1];
        else throw new Error('无法解析 URL');

        // 2. Extract Method
        const methodMatch = curlInput.match(/-X\s+([A-Z]+)/);
        if (methodMatch) method = methodMatch[1];

        // 3. Extract Headers
        const headerRegex = /(?:-H|--header)\s+['"]([^'"]+)['"]/g;
        let hMatch;
        while ((hMatch = headerRegex.exec(curlInput)) !== null) {
            const parts = hMatch[1].split(/:\s*/);
            if(parts.length >= 2) {
                headers[parts[0]] = parts.slice(1).join(':');
            }
        }

        // 4. Extract Body
        const dataMatch = curlInput.match(/(?:-d|--data|--data-raw)\s+['"]([\s\S]*?)['"](?=\s+(?:-H|-X|curl|$))/);
        const dataMatchEnd = curlInput.match(/(?:-d|--data|--data-raw)\s+['"]([\s\S]*)['"]$/);
        
        const rawBody = dataMatch ? dataMatch[1] : (dataMatchEnd ? dataMatchEnd[1] : null);

        if (rawBody) {
             body = rawBody;
             if (method === 'GET') method = 'POST'; // implicit post if data present
        }

        // Execute Fetch
        const response = await fetch(url, {
            method,
            headers,
            body
        });

        const resText = await response.text();
        let resBody = resText;
        try {
            resBody = JSON.stringify(JSON.parse(resText), null, 2);
        } catch {}

        const resHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => resHeaders[k] = v);

        setCurlResult({
            status: response.status,
            headers: resHeaders,
            body: resBody
        });
        showToast('success', '请求已执行');

    } catch (e: any) {
        setCurlResult({
            status: 0,
            headers: {},
            body: `Error parsing or executing cURL: ${e.message}`
        });
        showToast('error', '执行失败');
    } finally {
        setIsCurlRunning(false);
    }
  };

  const constructTempConfig = (): ApiConfig => {
    const headersObj: Record<string, string> = {};
    customHeaders.forEach(h => { if(h.key) headersObj[h.key] = h.value; });

    const paramsObj: Record<string, any> = {};
    customParams.forEach(p => { if(p.key) paramsObj[p.key] = p.value; });

    return {
      id: 'temp_test',
      name: name || 'Test Config',
      apiKey,
      baseUrl: baseUrl || 'custom',
      connectionMode: activeTab === 'standard' ? 'standard' : 'custom',
      features: ['chat', 'models'], 
      modelsEndpoint: activeTab === 'standard' ? undefined : modelsEndpoint,
      chatEndpoint: activeTab === 'standard' ? undefined : chatEndpoint,
      customHeaders: Object.keys(headersObj).length ? headersObj : undefined,
      customParams: Object.keys(paramsObj).length ? paramsObj : undefined,
      autoV1: activeTab === 'standard' ? autoV1 : false, 
      createdAt: 0
    };
  };

  const getStandardPreview = (type: 'chat' | 'models') => {
      if (!baseUrl) return '等待输入...';
      let url = baseUrl.trim();
      if (url.endsWith('/')) url = url.slice(0, -1);
      
      if (!autoV1) return url;

      const suffix = type === 'models' ? 'models' : 'chat/completions';
      if (url.endsWith('/v1')) return `${url}/${suffix}`;
      return `${url}/v1/${suffix}`;
  };

  const handleTestConnection = async () => {
      if (!apiKey) { showToast('error', '请先填写 API Key'); return; }
      if (activeTab === 'standard' && !baseUrl) { showToast('error', '请先填写 Base URL'); return; }
      
      setIsTesting(true);
      setTestResult(null);
      
      try {
          const config = constructTempConfig();
          
          if (enableModels) {
              const models = await fetchModels(config);
              setTestResult({
                  success: true,
                  title: `成功获取 ${models.length} 个模型`,
                  content: models.slice(0, 5) // Show first 5
              });
          } else {
              // Test Chat only
              const res = await testModelLatency(config, 'gpt-3.5-turbo', 10);
              if (res.status === 'success') {
                  setTestResult({
                      success: true,
                      title: '对话接口测试成功',
                      content: res.responseBody
                  });
              } else {
                  throw new Error(res.message || '测试失败');
              }
          }
      } catch (e: any) {
          setTestResult({
              success: false,
              title: '连接测试失败',
              content: e.message
          });
      } finally {
          setIsTesting(false);
      }
  };

  const handleSave = () => {
    if (!name.trim()) { showToast('error', '请输入连接名称'); return; }
    if (!apiKey.trim()) { showToast('error', '请输入 API Key'); return; }

    const features: ('chat'|'models')[] = [];
    if (enableChat) features.push('chat');
    if (enableModels) features.push('models');

    if (features.length === 0) { showToast('error', '请至少启用一个功能 (模型列表或对话)'); return; }

    const config = constructTempConfig();
    config.id = initialData?.id || crypto.randomUUID();
    config.createdAt = initialData?.createdAt || Date.now();

    onSave(config);
  };

  // --- Smart Fill Logic ---
  const executeSmartFill = async () => {
    if (!smartFillText.trim()) { showToast('error', '请粘贴需要提取的内容'); return; }
    if (!smartFillConfig.baseUrl || !smartFillConfig.apiKey) {
      showToast('error', '请先配置提取服务的 API 信息');
      setShowSmartFillConfig(true);
      return;
    }

    setIsExtracting(true);
    // Save config for future
    localStorage.setItem('omni_smart_fill_config', JSON.stringify(smartFillConfig));

    try {
      const endpoint = smartFillConfig.baseUrl.endsWith('/v1') 
          ? `${smartFillConfig.baseUrl}/chat/completions` 
          : (smartFillConfig.baseUrl.endsWith('/') ? `${smartFillConfig.baseUrl}v1/chat/completions` : `${smartFillConfig.baseUrl}/v1/chat/completions`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${smartFillConfig.apiKey}`
        },
        body: JSON.stringify({
          model: smartFillConfig.model,
          messages: [
            { role: 'system', content: smartFillConfig.prompt },
            { role: 'user', content: smartFillText }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`Extraction Service Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Model returned empty response');

      // Attempt to clean markdown code blocks if present
      const cleanJsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanJsonStr);

      let filledCount = 0;
      if (result.name) {
          setName(result.name);
          filledCount++;
      }
      if (result.baseUrl) {
        setBaseUrl(result.baseUrl);
        filledCount++;
      }
      if (result.apiKey) {
        setApiKey(result.apiKey);
        filledCount++;
      }

      // Handle customHeaders
      if (result.customHeaders && typeof result.customHeaders === 'object') {
          const newHeaders = Object.entries(result.customHeaders).map(([k, v]) => ({ key: k, value: String(v) }));
          if (newHeaders.length > 0) {
              setCustomHeaders(newHeaders);
              filledCount++;
          }
      }

      // Handle customParams
      if (result.customParams && typeof result.customParams === 'object') {
          const newParams = Object.entries(result.customParams).map(([k, v]) => ({ key: k, value: String(v) }));
          if (newParams.length > 0) {
              setCustomParams(newParams);
              filledCount++;
          }
      }

      if (filledCount > 0) {
        showToast('success', `AI 识别成功，已填入 ${filledCount} 个字段 (含名称/Header)`);
        setShowSmartFill(false);
      } else {
        showToast('error', '未能从文本中提取到有效信息');
      }

    } catch (e: any) {
      console.error(e);
      showToast('error', `智能提取失败: ${e.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in relative">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-accents-2 bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="p-2 hover:bg-accents-2 rounded-full"><Icons.ArrowRight className="rotate-180" /></button>
          <div>
            <h1 className="text-xl font-bold">{initialData ? '编辑 API 连接' : '新建 API 连接'}</h1>
            <p className="text-sm text-accents-5">配置 LLM 服务的连接方式与参数。</p>
          </div>
        </div>
        <div className="flex gap-3">
          {activeTab !== 'curl' && (
            <>
                <button onClick={onCancel} className="px-4 py-2 text-sm text-accents-5 hover:text-foreground">取消</button>
                <button onClick={handleTestConnection} disabled={isTesting} className="px-4 py-2 bg-accents-2 text-foreground rounded-md text-sm font-medium hover:bg-accents-3 flex items-center gap-2">
                    {isTesting ? <Icons.Loading className="animate-spin" size={16}/> : <Icons.Zap size={16}/>} 测试连接
                </button>
                <button onClick={handleSave} className="px-6 py-2 bg-foreground text-background rounded-md text-sm font-bold hover:opacity-90 flex items-center gap-2">
                    <Icons.Save size={16}/> 保存连接
                </button>
            </>
          )}
          {activeTab === 'curl' && (
             <button onClick={onCancel} className="px-4 py-2 text-sm text-accents-5 hover:text-foreground">退出</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl mx-auto w-full">
        
        {/* Mode Tabs */}
        <div className="flex gap-1 bg-accents-1 p-1 rounded-lg border border-accents-2 mb-8 w-fit">
          <button onClick={() => setActiveTab('standard')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'standard' ? 'bg-background shadow-sm text-foreground' : 'text-accents-5 hover:text-foreground'}`}>标准模式 (OpenAI)</button>
          <button onClick={() => setActiveTab('advanced')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'advanced' ? 'bg-background shadow-sm text-foreground' : 'text-accents-5 hover:text-foreground'}`}>自定义 / 高级</button>
          <button onClick={() => setActiveTab('curl')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'curl' ? 'bg-background shadow-sm text-foreground' : 'text-accents-5 hover:text-foreground'}`}>cURL 测试工具</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left Column: Connection Info */}
          <div className="lg:col-span-2 space-y-8">
            
            {activeTab === 'curl' && (
              <div className="space-y-6">
                 <div className="space-y-4 border border-accents-2 p-6 rounded-xl bg-accents-1">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold"><Icons.Terminal size={18}/> cURL 命令</div>
                     </div>
                     <textarea 
                       className="w-full h-40 p-4 font-mono text-xs bg-background border border-accents-2 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-foreground"
                       placeholder={`curl https://api.openai.com/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer sk-..." ...`}
                       value={curlInput}
                       onChange={e => setCurlInput(e.target.value)}
                     />
                     <button 
                       onClick={handleRunCurl} 
                       disabled={isCurlRunning}
                       className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-bold w-full flex items-center justify-center gap-2 hover:opacity-90"
                     >
                       {isCurlRunning ? <Icons.Loading className="animate-spin" size={16}/> : <Icons.Play size={16}/>}
                       立即运行请求 (Run Request)
                     </button>
                  </div>

                  {curlResult && (
                      <div className="border border-accents-2 rounded-xl overflow-hidden bg-background animate-fade-in shadow-md">
                          <div className={`p-3 border-b border-accents-2 flex justify-between items-center ${curlResult.status >= 200 && curlResult.status < 300 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                             <div className="font-bold flex items-center gap-2">
                                {curlResult.status >= 200 && curlResult.status < 300 ? <Icons.CheckCircle size={16}/> : <Icons.ErrorCircle size={16}/>}
                                HTTP {curlResult.status}
                             </div>
                             <div className="text-xs opacity-70">cURL Response</div>
                          </div>
                          
                          <div className="flex flex-col h-[400px]">
                             <div className="h-1/3 border-b border-accents-2 overflow-auto p-4 bg-accents-1">
                                <h4 className="text-xs font-bold text-accents-5 uppercase mb-2">Response Headers</h4>
                                <pre className="text-xs font-mono text-accents-6">
                                   {Object.entries(curlResult.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
                                </pre>
                             </div>
                             <div className="flex-1 overflow-auto p-4 relative">
                                <h4 className="text-xs font-bold text-accents-5 uppercase mb-2 sticky top-0 bg-background pb-2">Response Body</h4>
                                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                                   {curlResult.body}
                                </pre>
                             </div>
                          </div>
                      </div>
                  )}
              </div>
            )}

            {activeTab !== 'curl' && (
              <>
                <div className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2"><Icons.Server size={20}/> 基础信息</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-accents-5">连接名称</label>
                      <input className="w-full px-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="My LLM API" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-accents-5">API Key</label>
                      <input className="w-full px-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground" type="text" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <h3 className="text-lg font-bold flex items-center gap-2"><Icons.Zap size={20}/> 接口地址配置</h3>
                     <div className="flex gap-2">
                       {activeTab === 'standard' && (
                          <button 
                            onClick={() => setShowSmartFill(true)}
                            className="text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 hover:shadow-lg transition-all"
                          >
                            <Icons.Sparkles size={12} /> 快捷智能填入
                          </button>
                       )}
                       {activeTab === 'standard' && (
                          <button 
                            onClick={() => setShowPresets(true)}
                            className="text-xs bg-accents-1 border border-accents-2 text-foreground px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 hover:bg-accents-2 transition-colors"
                          >
                            <Icons.Grid size={12} /> 常用厂商
                          </button>
                       )}
                     </div>
                  </div>
                  
                  {activeTab === 'standard' ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold uppercase text-accents-5">Base URL</label>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-accents-5 cursor-pointer select-none" onClick={() => setAutoV1(!autoV1)}>自动补全 /v1</label>
                                <Checkbox checked={autoV1} onChange={() => setAutoV1(!autoV1)} />
                            </div>
                        </div>
                        <input className="w-full px-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                      </div>
                      
                      <div className="mt-2 p-3 bg-accents-1 rounded-md border border-accents-2 text-xs font-mono text-accents-5 space-y-1">
                          <div className="flex gap-2">
                            <span className="font-bold uppercase w-12 text-accents-4 shrink-0">Models:</span>
                            <span className="truncate">{getStandardPreview('models')}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold uppercase w-12 text-accents-4 shrink-0">Chat:</span>
                            <span className="truncate">{getStandardPreview('chat')}</span>
                          </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 p-4 border border-accents-2 rounded-lg bg-accents-1/30">
                       <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-xs font-semibold uppercase text-accents-5">获取模型列表 (GET)</label>
                            {!enableModels && <span className="text-xs text-accents-4">已禁用</span>}
                          </div>
                          <input 
                            className="w-full px-3 py-2 bg-background border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground disabled:opacity-50" 
                            placeholder="https://.../v1/models" 
                            value={modelsEndpoint} 
                            onChange={e => setModelsEndpoint(e.target.value)} 
                            disabled={!enableModels}
                          />
                          <div className="text-[10px] text-accents-5 font-mono truncate">Preview: {modelsEndpoint || '...'}</div>
                       </div>
                       <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-xs font-semibold uppercase text-accents-5">对话补全 (POST)</label>
                            {!enableChat && <span className="text-xs text-accents-4">已禁用</span>}
                          </div>
                          <input 
                            className="w-full px-3 py-2 bg-background border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground disabled:opacity-50" 
                            placeholder="https://.../v1/chat/completions" 
                            value={chatEndpoint} 
                            onChange={e => setChatEndpoint(e.target.value)}
                            disabled={!enableChat} 
                          />
                          <div className="text-[10px] text-accents-5 font-mono truncate">Preview: {chatEndpoint || '...'}</div>
                       </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                   <h3 className="text-lg font-bold flex items-center gap-2"><Icons.Sliders size={20}/> 请求增强 <span className="text-sm font-normal text-accents-5">(非必选)</span></h3>
                   
                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <label className="text-sm font-medium">自定义 Headers</label>
                         <button onClick={() => setCustomHeaders([...customHeaders, {key: '', value: ''}])} className="text-xs flex items-center gap-1 hover:text-success"><Icons.Plus size={12}/> 添加</button>
                      </div>
                      {customHeaders.map((h, i) => (
                        <div key={i} className="flex gap-2">
                           <input className="flex-1 px-2 py-1.5 bg-accents-1 border border-accents-2 rounded text-sm" placeholder="Key (e.g. X-Custom-Auth)" value={h.key} onChange={e => { const n = [...customHeaders]; n[i].key = e.target.value; setCustomHeaders(n); }} />
                           <input className="flex-1 px-2 py-1.5 bg-accents-1 border border-accents-2 rounded text-sm" placeholder="Value" value={h.value} onChange={e => { const n = [...customHeaders]; n[i].value = e.target.value; setCustomHeaders(n); }} />
                           <button onClick={() => setCustomHeaders(customHeaders.filter((_, idx) => idx !== i))} className="p-1.5 text-accents-4 hover:text-error"><Icons.Trash size={14}/></button>
                        </div>
                      ))}
                      {customHeaders.length === 0 && <div className="text-xs text-accents-4 italic p-2 border border-dashed border-accents-2 rounded text-center">无自定义 Header</div>}
                   </div>

                   <div className="space-y-3 pt-4 border-t border-accents-2">
                      <div className="flex items-center justify-between">
                         <label className="text-sm font-medium">固定 Body 参数 (JSON)</label>
                         <button onClick={() => setCustomParams([...customParams, {key: '', value: ''}])} className="text-xs flex items-center gap-1 hover:text-success"><Icons.Plus size={12}/> 添加</button>
                      </div>
                      {customParams.map((p, i) => (
                        <div key={i} className="flex gap-2">
                           <input className="flex-1 px-2 py-1.5 bg-accents-1 border border-accents-2 rounded text-sm" placeholder="Parameter (e.g. model_version)" value={p.key} onChange={e => { const n = [...customParams]; n[i].key = e.target.value; setCustomParams(n); }} />
                           <input className="flex-1 px-2 py-1.5 bg-accents-1 border border-accents-2 rounded text-sm" placeholder="Value" value={p.value} onChange={e => { const n = [...customParams]; n[i].value = e.target.value; setCustomParams(n); }} />
                           <button onClick={() => setCustomParams(customParams.filter((_, idx) => idx !== i))} className="p-1.5 text-accents-4 hover:text-error"><Icons.Trash size={14}/></button>
                        </div>
                      ))}
                      {customParams.length === 0 && <div className="text-xs text-accents-4 italic p-2 border border-dashed border-accents-2 rounded text-center">无额外 Body 参数</div>}
                   </div>
                </div>
              </>
            )}
          </div>

          {/* Right Column: Capabilities */}
          {activeTab !== 'curl' && (
            <div className="space-y-6">
                <div className="p-6 border border-accents-2 rounded-xl bg-accents-1">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Icons.Tool size={18}/> 功能开关</h3>
                    <div className="space-y-3">
                    <div 
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${enableModels ? 'bg-background border-success/50 shadow-sm' : 'border-accents-2 opacity-60'}`}
                        onClick={() => setEnableModels(!enableModels)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-md ${enableModels ? 'bg-success text-white' : 'bg-accents-2 text-accents-4'}`}><Icons.Grid size={16}/></div>
                            <div className="text-sm font-medium">获取模型列表</div>
                        </div>
                        <Checkbox checked={enableModels} onChange={() => setEnableModels(!enableModels)} />
                    </div>

                    <div 
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${enableChat ? 'bg-background border-success/50 shadow-sm' : 'border-accents-2 opacity-60'}`}
                        onClick={() => setEnableChat(!enableChat)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-md ${enableChat ? 'bg-success text-white' : 'bg-accents-2 text-accents-4'}`}><Icons.Chat size={16}/></div>
                            <div className="text-sm font-medium">对话能力</div>
                        </div>
                        <Checkbox checked={enableChat} onChange={() => setEnableChat(!enableChat)} />
                    </div>
                    </div>
                    <p className="text-xs text-accents-5 mt-4 leading-relaxed">
                    如果您的 API 仅支持对话而不提供模型列表接口，请关闭“获取模型列表”。在对话页中，您需要手动输入模型 ID。
                    </p>
                </div>
            </div>
          )}
          {activeTab === 'curl' && (
             <div className="space-y-6">
                <div className="p-6 border border-accents-2 rounded-xl bg-accents-1">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Icons.Info size={18}/> 快速调试</h3>
                    <p className="text-sm text-accents-5 leading-relaxed">
                        此工具用于直接测试 cURL 命令，帮助您调试 API 返回格式或网络连通性。请求将在您的浏览器本地发起。
                    </p>
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 text-blue-800 rounded-lg text-xs">
                        <span className="font-bold">提示:</span> 该功能不会保存 API 配置，仅做临时调试使用。如需添加连接，请切换至“标准模式”或“自定义”。
                    </div>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* Smart Fill Modal */}
      <AnimatePresence>
        {showSmartFill && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden border border-accents-2 flex flex-col max-h-[90vh]">
                 <div className="p-4 border-b border-accents-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 flex justify-between items-center shrink-0">
                    <div>
                       <h2 className="font-bold text-lg flex items-center gap-2"><Icons.Sparkles className="text-purple-500" size={20}/> AI 智能填入</h2>
                       <p className="text-xs text-accents-5">粘贴杂乱的文本，AI 自动提取 API Key 和 Base URL。</p>
                    </div>
                    <button onClick={() => setShowSmartFill(false)}><Icons.X size={20}/></button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="space-y-2">
                       <label className="text-xs font-semibold uppercase text-accents-5">粘贴内容</label>
                       <textarea 
                          className="w-full h-32 p-3 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground text-sm resize-none"
                          placeholder="例如：这是我的 Key sk-xxxxxx，接口地址是 https://api.example.com..."
                          value={smartFillText}
                          onChange={e => setSmartFillText(e.target.value)}
                       />
                    </div>

                    <div className="border border-accents-2 rounded-lg overflow-hidden">
                       <div 
                         className="p-3 bg-accents-1 flex justify-between items-center cursor-pointer hover:bg-accents-2 transition-colors"
                         onClick={() => setShowSmartFillConfig(!showSmartFillConfig)}
                       >
                          <div className="flex items-center gap-2 text-sm font-medium">
                             <Icons.Bot size={16}/> 提取服务配置
                             {!smartFillConfig.apiKey && <span className="text-xs text-error">(未配置)</span>}
                          </div>
                          <Icons.ChevronRight size={16} className={`transition-transform ${showSmartFillConfig ? 'rotate-90' : ''}`}/>
                       </div>
                       
                       <AnimatePresence>
                         {(showSmartFillConfig || !smartFillConfig.apiKey) && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }} 
                              animate={{ height: 'auto', opacity: 1 }} 
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-accents-2 p-4 bg-background space-y-4"
                            >
                               <div className="text-xs text-accents-5 bg-accents-1 p-2 rounded">
                                  请配置用于执行提取任务的 LLM API (如您的 OpenAI Key)。此配置仅保存在本地。
                               </div>
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                     <label className="text-xs font-medium text-accents-5">API Endpoint</label>
                                     <input 
                                        className="w-full px-2 py-1.5 border border-accents-2 rounded bg-accents-1 text-sm"
                                        placeholder="https://api.openai.com/v1"
                                        value={smartFillConfig.baseUrl}
                                        onChange={e => setSmartFillConfig({...smartFillConfig, baseUrl: e.target.value})}
                                     />
                                  </div>
                                  <div className="space-y-1">
                                     <label className="text-xs font-medium text-accents-5">API Key</label>
                                     <input 
                                        type="password"
                                        className="w-full px-2 py-1.5 border border-accents-2 rounded bg-accents-1 text-sm"
                                        placeholder="sk-..."
                                        value={smartFillConfig.apiKey}
                                        onChange={e => setSmartFillConfig({...smartFillConfig, apiKey: e.target.value})}
                                     />
                                  </div>
                               </div>
                               <div className="space-y-1">
                                  <label className="text-xs font-medium text-accents-5">Model</label>
                                  <input 
                                     className="w-full px-2 py-1.5 border border-accents-2 rounded bg-accents-1 text-sm"
                                     placeholder="gpt-3.5-turbo"
                                     value={smartFillConfig.model}
                                     onChange={e => setSmartFillConfig({...smartFillConfig, model: e.target.value})}
                                  />
                               </div>
                               <div className="space-y-1">
                                  <label className="text-xs font-medium text-accents-5">System Prompt</label>
                                  <textarea 
                                     className="w-full px-2 py-1.5 border border-accents-2 rounded bg-accents-1 text-xs font-mono h-20 resize-none"
                                     value={smartFillConfig.prompt}
                                     onChange={e => setSmartFillConfig({...smartFillConfig, prompt: e.target.value})}
                                  />
                               </div>
                            </motion.div>
                         )}
                       </AnimatePresence>
                    </div>
                 </div>

                 <div className="p-4 border-t border-accents-2 bg-accents-1 flex justify-end gap-3 shrink-0">
                    <button onClick={() => setShowSmartFill(false)} className="px-4 py-2 text-sm text-accents-5 hover:text-foreground">取消</button>
                    <button 
                      onClick={executeSmartFill}
                      disabled={isExtracting}
                      className="px-6 py-2 bg-foreground text-background rounded-md text-sm font-bold hover:opacity-90 flex items-center gap-2"
                    >
                       {isExtracting ? <Icons.Loading className="animate-spin" size={16}/> : <Icons.Sparkles size={16}/>}
                       {isExtracting ? '正在提取...' : '立即识别填入'}
                    </button>
                 </div>
              </motion.div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Preset Modal */}
      <AnimatePresence>
        {showPresets && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
               initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} 
               className="bg-background w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl overflow-hidden border border-accents-2 flex flex-col"
            >
              <div className="p-4 border-b border-accents-2 bg-accents-1 flex justify-between items-center shrink-0">
                 <div>
                    <h2 className="font-bold text-lg flex items-center gap-2"><Icons.Grid size={20}/> 选择 API 提供商</h2>
                    <p className="text-xs text-accents-5">点击即用，自动配置 Base URL (点击后请填写 Key)</p>
                 </div>
                 <button onClick={() => setShowPresets(false)} className="p-2 hover:bg-accents-2 rounded-full"><Icons.X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-accents-1">
                 <div className="space-y-8">
                    {PROVIDERS.map((group, idx) => (
                      <div key={idx}>
                         <h3 className="text-sm font-bold uppercase tracking-wider text-accents-5 mb-3 flex items-center gap-2">
                           {group.category.includes('国内') ? <span className="w-2 h-2 rounded-full bg-red-500"/> : <span className="w-2 h-2 rounded-full bg-blue-500"/>}
                           {group.category}
                         </h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {group.items.map((provider) => (
                              <button 
                                key={provider.name}
                                onClick={() => handleSelectPreset(provider)}
                                className="flex flex-col text-left p-4 bg-background border border-accents-2 rounded-xl hover:border-foreground hover:shadow-md transition-all group"
                              >
                                 <div className="font-bold text-base mb-1 group-hover:text-success transition-colors">{provider.name}</div>
                                 <div className="text-[10px] font-mono text-accents-4 bg-accents-1 px-1.5 py-0.5 rounded w-fit mb-2 truncate max-w-full">
                                   {provider.url}
                                 </div>
                                 <div className="text-xs text-accents-5 mt-auto">
                                   {provider.desc}
                                 </div>
                              </button>
                            ))}
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
              <div className="p-4 border-t border-accents-2 bg-background shrink-0 text-center">
                 <button onClick={() => setShowPresets(false)} className="text-sm text-accents-5 hover:text-foreground">取消选择</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Test Result Modal */}
      <AnimatePresence>
        {testResult && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-background w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-accents-2">
                <div className={`p-4 border-b border-accents-2 font-semibold flex justify-between items-center ${testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                   <span className="flex items-center gap-2">
                      {testResult.success ? <Icons.CheckCircle size={18}/> : <Icons.ErrorCircle size={18}/>}
                      {testResult.title}
                   </span>
                   <button onClick={() => setTestResult(null)}><Icons.X size={18}/></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                   <pre className="text-xs font-mono bg-accents-1 p-3 rounded border border-accents-2 overflow-x-auto whitespace-pre-wrap">
                      {typeof testResult.content === 'string' ? testResult.content : JSON.stringify(testResult.content, null, 2)}
                   </pre>
                </div>
                <div className="p-4 border-t border-accents-2 bg-accents-1 flex justify-end">
                   <button onClick={() => setTestResult(null)} className="px-4 py-2 bg-background border border-accents-2 rounded text-sm hover:bg-accents-2">关闭</button>
                </div>
             </motion.div>
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};