export interface ApiConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  
  // Advanced Configuration
  connectionMode: 'standard' | 'custom'; // standard = auto-detect, custom = manual endpoints
  features: ('chat' | 'models')[]; // What this API supports
  
  modelsEndpoint?: string; // Full URL for GET models
  chatEndpoint?: string; // Full URL for POST chat/completions
  
  customHeaders?: Record<string, string>;
  customParams?: Record<string, any>; // Merged into JSON body
  
  skipAutoCompletion?: boolean; // Legacy: use exact URL
  autoV1?: boolean; // New: Auto append /v1/ to paths in standard mode
  createdAt: number;
}

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface TestResult {
  modelId: string;
  latency: number; // in ms
  status: 'success' | 'error' | 'pending';
  message?: string;
  timestamp: number;
  // Detailed debug info
  statusCode?: number;
  requestBody?: any;
  responseBody?: any;
}

export interface ToolTestResult {
  modelId: string;
  status: 'supported' | 'unsupported' | 'error' | 'pending';
  latency: number;
  requestBody: any;
  responseBody: any;
  message?: string;
  timestamp: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface ChatConfig {
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_tokens: number;
  seed?: number;
  stream: boolean;
  enableImage: boolean;
  imageUrl?: string;
}

export interface DebugInfo {
  previewBody: string; 
  actualBody?: string;
  responseBody?: string;
}

export interface GlobalSettings {
  testTimeout: number; 
  testConcurrency: number; 
  testRounds: number;
  stream: boolean;
}

export interface MatrixCellResult {
  latency: number;
  status: 'success' | 'error' | 'pending';
  message?: string;
  statusCode?: number;
  requestBody?: any;
  responseBody?: any;
}

export interface MatrixRowResult {
  key: string;
  results: Record<string, MatrixCellResult>; // modelId -> result
}

export interface RequestLog {
  id: string;
  timestamp: number;
  type: 'chat' | 'models' | 'test' | 'tool_check'; 
  apiId: string;
  apiName: string;
  model?: string;
  method: string;
  url: string;
  status: number; 
  latency: number; 
  requestBody?: any;
  responseBody?: any;
  error?: string;
}

export interface LogFilter {
  search: string;
  status: 'all' | 'success' | 'error';
  apiId: string | 'all';
}

export type Theme = 'light' | 'dark';

export type ViewMode = 'chat' | 'logs' | 'analytics' | 'prompts' | 'settings' | 'docs' | 'bulk' | 'add_api';

export interface SendMessageResult {
  actualBody: string;
  responseBody: string;
}