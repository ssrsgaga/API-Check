import { ApiConfig, Model, TestResult, ChatMessage, ChatConfig, RequestLog, ToolTestResult, SendMessageResult } from '../types';
import { saveLog } from './dbService';

// Helper to determine the actual URL based on config mode
const getEndpoint = (api: ApiConfig, type: 'models' | 'chat'): string => {
  if (api.connectionMode === 'custom') {
    if (type === 'models') return api.modelsEndpoint || '';
    if (type === 'chat') return api.chatEndpoint || '';
  }

  let baseUrl = api.baseUrl.trim();
  // Ensure no trailing slash
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  if (api.skipAutoCompletion) {
    // Legacy support
    return `${baseUrl}/${type === 'models' ? 'models' : 'chat/completions'}`;
  }

  // Current Logic
  const autoV1 = api.autoV1 ?? true; // Default to true if undefined
  
  if (!autoV1) {
    // strict mode: return user input exactly as is
    return baseUrl;
  }

  const suffix = type === 'models' ? 'models' : 'chat/completions';
  
  // Check if user already included /v1 to avoid duplication
  if (baseUrl.endsWith('/v1')) {
      return `${baseUrl}/${suffix}`;
  }
  return `${baseUrl}/v1/${suffix}`;
};

const createLogEntry = (
  api: ApiConfig, 
  type: RequestLog['type'], 
  url: string, 
  method: string,
  model?: string,
  requestBody?: any
): RequestLog => ({
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  type,
  apiId: api.id,
  apiName: api.name,
  model,
  method,
  url,
  status: 0,
  latency: 0,
  requestBody
});

export const fetchModels = async (api: ApiConfig): Promise<Model[]> => {
  // If API is configured to NOT support models fetch, return empty or mock
  if (api.features && !api.features.includes('models')) {
      return [];
  }

  const url = getEndpoint(api, 'models');
  if (!url) throw new Error('未配置模型列表接口地址');

  const log = createLogEntry(api, 'models', url, 'GET');
  const start = performance.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); 

  try {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${api.apiKey}`,
        'Content-Type': 'application/json',
        ...(api.customHeaders || {})
    };

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    log.latency = Math.round(performance.now() - start);
    log.status = response.status;

    if (response.ok) {
      const data = await response.json();
      log.responseBody = data; 
      saveLog(log);

      if (Array.isArray(data)) return data;
      if (data.data && Array.isArray(data.data)) return data.data;
      throw new Error('返回数据格式不符合 OpenAI 标准 (缺少 array 或 data 字段)');
    }
    
    const errorText = await response.text();
    log.responseBody = errorText;
    log.error = errorText;
    saveLog(log);

    let errorMsg = `HTTP ${response.status} ${response.statusText}`;
    try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
            errorMsg += `: ${errorJson.error.message}`;
        } else {
            errorMsg += `: ${errorText.slice(0, 200)}`;
        }
    } catch {
        errorMsg += `: ${errorText.slice(0, 200)}`;
    }
    throw new Error(errorMsg);

  } catch (err: any) {
    clearTimeout(timeoutId);
    log.latency = Math.round(performance.now() - start);
    log.error = err.message;
    saveLog(log);

    if (err.name === 'AbortError') {
        throw new Error('请求超时 (10秒)，请检查网络连接或代理设置');
    }
    throw err;
  }
};

export const testModelLatency = async (
  api: ApiConfig, 
  modelId: string,
  timeoutSeconds: number = 15,
  stream: boolean = false
): Promise<TestResult> => {
  const url = getEndpoint(api, 'chat');
  if (!url) return { modelId, latency: 0, status: 'error', message: '未配置对话接口', timestamp: Date.now() };

  const requestBody = {
    model: modelId,
    messages: [{ role: 'user', content: 'Hi' }],
    max_tokens: 1,
    stream,
    ...(api.customParams || {})
  };
  
  const log = createLogEntry(api, 'test', url, 'POST', modelId, requestBody);
  const start = performance.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${api.apiKey}`,
        'Content-Type': 'application/json',
        ...(api.customHeaders || {})
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    log.status = response.status;
    log.latency = Math.round(performance.now() - start);

    if (response.ok) {
      let data: any;
      if (stream) {
          // For latency test with stream, we just read the body to ensure connectivity
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let done = false;
          let accumulated = '';
          while (reader && !done) {
              const { value, done: rDone } = await reader.read();
              done = rDone;
              if(value) accumulated += decoder.decode(value, { stream: true });
          }
          data = { stream_content: accumulated.slice(0, 1000) + (accumulated.length > 1000 ? '...' : '') };
      } else {
          data = await response.json();
      }
      
      log.responseBody = data;
      saveLog(log);
      
      return {
        modelId,
        latency: log.latency,
        status: 'success',
        timestamp: Date.now(),
        statusCode: response.status,
        requestBody,
        responseBody: data
      };
    } else {
      const errorText = await response.text();
      log.responseBody = errorText;
      log.error = errorText;
      saveLog(log);

      let shortMsg = `HTTP ${response.status}`;
      try {
          const json = JSON.parse(errorText);
          if (json.error?.message) shortMsg += `: ${json.error.message}`;
          else if (json.message) shortMsg += `: ${json.message}`;
          else shortMsg += ` ${response.statusText}`;
      } catch {
          shortMsg += ` ${response.statusText}`;
      }

      return {
        modelId,
        latency: 0,
        status: 'error',
        message: shortMsg,
        timestamp: Date.now(),
        statusCode: response.status,
        requestBody,
        responseBody: errorText
      };
    }
  } catch (error: any) {
    log.latency = Math.round(performance.now() - start);
    log.error = error.message;
    saveLog(log);

    return {
      modelId,
      latency: 0,
      status: 'error',
      message: error.name === 'AbortError' ? `请求超时 (${timeoutSeconds}s)` : (error.message || '网络错误'),
      timestamp: Date.now(),
      statusCode: 0,
      requestBody,
      responseBody: error.message
    };
  }
};

export const testModelToolSupport = async (
    api: ApiConfig,
    modelId: string,
    timeoutSeconds: number = 20
): Promise<ToolTestResult> => {
    const url = getEndpoint(api, 'chat');
    if (!url) return { modelId, latency: 0, status: 'error', message: '未配置对话接口', timestamp: Date.now(), requestBody: {}, responseBody: {} };

    // Define a simple dummy tool
    const tools = [{
        type: "function",
        function: {
            name: "get_weather",
            description: "Get the current weather",
            parameters: {
                type: "object",
                properties: {
                    location: { type: "string" }
                },
                required: ["location"]
            }
        }
    }];

    const requestBody = {
        model: modelId,
        messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
        tools: tools,
        tool_choice: "auto",
        max_tokens: 50,
        ...(api.customParams || {})
    };

    const log = createLogEntry(api, 'tool_check', url, 'POST', modelId, requestBody);
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${api.apiKey}`,
            'Content-Type': 'application/json',
            ...(api.customHeaders || {})
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - start);
        log.status = response.status;
        log.latency = latency;

        if (response.ok) {
            const data = await response.json();
            log.responseBody = data;
            saveLog(log);

            const choice = data.choices?.[0];
            const hasToolCalls = choice?.message?.tool_calls?.length > 0 || choice?.message?.function_call;
            
            return {
                modelId,
                status: hasToolCalls ? 'supported' : 'unsupported',
                latency,
                requestBody,
                responseBody: data,
                message: hasToolCalls ? 'Successfully triggered tool call' : 'Model returned text instead of tool call',
                timestamp: Date.now()
            };
        } else {
            const errorText = await response.text();
            log.responseBody = errorText;
            log.error = errorText;
            saveLog(log);
            
            return {
                modelId,
                status: 'error',
                latency,
                requestBody,
                responseBody: errorText,
                message: `HTTP ${response.status}`,
                timestamp: Date.now()
            };
        }
    } catch (error: any) {
        log.latency = Math.round(performance.now() - start);
        log.error = error.message;
        saveLog(log);
        return {
            modelId,
            status: 'error',
            latency: 0,
            requestBody,
            responseBody: error.message,
            message: error.message,
            timestamp: Date.now()
        };
    }
};

// ... keep testApiKeyConnectivity as is, but create tempApi respecting interface
export const testApiKeyConnectivity = async (
  baseUrl: string,
  apiKey: string,
  skipAutoCompletion: boolean = false
): Promise<{ success: boolean; latency: number; modelCount: number; message: string }> => {
  const tempApi: ApiConfig = {
    id: 'temp',
    name: 'BulkTest',
    baseUrl,
    apiKey,
    connectionMode: 'standard', // Default for bulk test
    features: ['models', 'chat'],
    skipAutoCompletion,
    autoV1: !skipAutoCompletion,
    createdAt: 0
  };

  const start = performance.now();
  try {
    const models = await fetchModels(tempApi);
    const end = performance.now();
    return {
      success: true,
      latency: Math.round(end - start),
      modelCount: models.length,
      message: 'OK'
    };
  } catch (e: any) {
    return {
      success: false,
      latency: 0,
      modelCount: 0,
      message: e.message || 'Unknown Error'
    };
  }
};

export const prepareChatBody = (
  modelId: string,
  messages: ChatMessage[],
  config: ChatConfig,
  currentInput: string
): any => {
  let userContent: any = currentInput;

  if (config.enableImage && config.imageUrl?.trim()) {
    userContent = [
      { type: 'text', text: currentInput },
      { 
        type: 'image_url', 
        image_url: { 
          url: config.imageUrl.trim() 
        } 
      }
    ];
  }

  const finalMessages = [
    ...messages,
    { role: 'user', content: userContent }
  ];

  const body: any = {
    model: modelId,
    messages: finalMessages,
    temperature: config.temperature,
    top_p: config.top_p,
    frequency_penalty: config.frequency_penalty,
    presence_penalty: config.presence_penalty,
    max_tokens: config.max_tokens,
    stream: config.stream,
  };

  if (config.seed !== undefined && config.seed !== null && !isNaN(config.seed)) {
    body.seed = config.seed;
  }

  return body;
};

export const sendChatMessage = async (
  api: ApiConfig,
  requestBody: any, 
  onChunk: (content: string) => void
): Promise<SendMessageResult> => {
  const url = getEndpoint(api, 'chat');
  if (!url) throw new Error('Chat Endpoint not configured');

  // Merge custom params into top-level body
  const finalBody = {
      ...requestBody,
      ...(api.customParams || {})
  };

  const log = createLogEntry(api, 'chat', url, 'POST', requestBody.model, finalBody);
  const start = performance.now();
  
  try {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${api.apiKey}`,
        'Content-Type': 'application/json',
        ...(api.customHeaders || {})
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(finalBody),
    });

    log.status = response.status;

    if (!response.ok) {
      const text = await response.text();
      log.responseBody = text;
      log.error = text;
      log.latency = Math.round(performance.now() - start);
      saveLog(log);

      let errorDetail = text;
      try {
          const json = JSON.parse(text);
          if (json.error) errorDetail = JSON.stringify(json.error, null, 2);
      } catch {}

      throw new Error(`[${response.status} ${response.statusText}]\n${errorDetail}`);
    }

    if (finalBody.stream) {
      if (!response.body) throw new Error('没有响应内容');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullText = '';
      let rawStream = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });
        rawStream += chunkValue;

        const lines = chunkValue.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.replace('data: ', ''));
              const content = json.choices?.[0]?.delta?.content || '';
              if (content) {
                  onChunk(content);
                  fullText += content; 
              }
            } catch (e) { }
          }
        }
      }
      
      log.latency = Math.round(performance.now() - start);
      log.responseBody = { stream_length: rawStream.length, generated_text: fullText };
      saveLog(log);

      return {
        actualBody: JSON.stringify(finalBody, null, 2),
        responseBody: rawStream 
      };
    } else {
      // Non-streaming
      const data = await response.json();
      log.latency = Math.round(performance.now() - start);
      log.responseBody = data;
      saveLog(log);

      const content = data.choices?.[0]?.message?.content || '';
      onChunk(content);
      return {
        actualBody: JSON.stringify(finalBody, null, 2),
        responseBody: JSON.stringify(data, null, 2)
      };
    }
  } catch (error: any) {
    if (!log.status) log.status = 0; 
    log.latency = Math.round(performance.now() - start);
    log.error = error.message;
    saveLog(log);
    throw error;
  }
};