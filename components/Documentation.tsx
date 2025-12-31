import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from './ui/Icons';

interface DocumentationProps {
  isOpen?: boolean; 
  onClose?: () => void;
  isPage?: boolean;
}

export const Documentation: React.FC<DocumentationProps> = ({ isOpen, onClose, isPage = false }) => {
  // If meant to be a modal and not open, return null
  if (!isPage && !isOpen) return null;

  const content = (
    <div className={`flex flex-col h-full bg-background text-foreground ${isPage ? 'animate-fade-in' : ''}`}>
      {!isPage && (
        <div className="flex items-center justify-between p-4 border-b border-accents-2 bg-accents-1 shrink-0">
          <div className="flex items-center gap-2">
            <Icons.Book size={20} />
            <span className="font-semibold">使用指南</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accents-2 rounded-md transition-colors">
            <Icons.X size={20} />
          </button>
        </div>
      )}
      
      {isPage && (
        <div className="p-6 md:p-8 border-b border-accents-2 mb-4 shrink-0">
           <div className="max-w-4xl mx-auto w-full">
             <h1 className="text-3xl font-bold flex items-center gap-3"><Icons.Book className="text-foreground"/> API Check 文档</h1>
             <p className="text-accents-5 mt-2">专业的本地化 LLM API 调试与连通性测试工具。</p>
           </div>
        </div>
      )}

      {/* Scroll container */}
      <div className={`flex-1 overflow-y-auto ${isPage ? 'px-6 md:px-8 pb-20' : 'p-6 md:p-8'}`}>
        <div className="max-w-4xl mx-auto w-full space-y-10">
          
          {/* Section 1: Core */}
          <section>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
              <Icons.Shield className="text-success" size={24} /> 核心理念：安全与隐私
            </h3>
            <p className="text-accents-5 leading-relaxed bg-accents-1 p-5 rounded-xl border border-accents-2">
              API Check 坚持 <strong>Pure Frontend (纯前端)</strong> 架构。您的 API Key、对话记录、设置和日志 <strong>100% 存储在您浏览器的本地存储 (Local Storage & IndexedDB) 中</strong>。无论是 DeepSeek 还是 OpenAI 的 Key，都不会经过我们的服务器，确保了极致的隐私安全。
            </p>
          </section>

          {/* Section 2: Features Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-5 border border-accents-2 rounded-xl bg-background hover:border-foreground transition-all group">
              <h4 className="font-bold mb-3 flex items-center gap-2 text-lg group-hover:text-success transition-colors">
                <Icons.Server size={20} /> 连接管理
              </h4>
              <p className="text-sm text-accents-5 leading-relaxed mb-3">
                支持标准 OpenAI 格式接口。内置了 <strong>DeepSeek、SiliconFlow、Aliyun、OpenAI、Groq</strong> 等数十家主流厂商的预设配置，点击即可一键填入，亦支持 cURL 命令自动解析导入。
              </p>
            </div>

            <div className="p-5 border border-accents-2 rounded-xl bg-background hover:border-foreground transition-all group">
              <h4 className="font-bold mb-3 flex items-center gap-2 text-lg group-hover:text-success transition-colors">
                <Icons.ListChecks size={20} /> 批量矩阵测活
              </h4>
              <p className="text-sm text-accents-5 leading-relaxed mb-3">
                还在手动测试 Key 是否有效？使用批量测活功能，输入多个 Key，选择多个模型（如 gpt-4o, deepseek-chat），系统将自动构建 <strong>N x M 测试矩阵</strong>，快速筛选可用组合，并支持导出 CSV/JSON 报告。
              </p>
            </div>

            <div className="p-5 border border-accents-2 rounded-xl bg-background hover:border-foreground transition-all group">
              <h4 className="font-bold mb-3 flex items-center gap-2 text-lg group-hover:text-success transition-colors">
                <Icons.Function size={20} /> 深度能力验证
              </h4>
              <p className="text-sm text-accents-5 leading-relaxed mb-3">
                不仅仅是 Ping 通。我们提供 <strong>Function Calling (FC) 专项测试</strong>，验证模型是否真正具备工具调用能力，还是仅仅在“假装”支持。
              </p>
            </div>

            <div className="p-5 border border-accents-2 rounded-xl bg-background hover:border-foreground transition-all group">
              <h4 className="font-bold mb-3 flex items-center gap-2 text-lg group-hover:text-success transition-colors">
                <Icons.Logs size={20} /> 审计与日志
              </h4>
              <p className="text-sm text-accents-5 leading-relaxed mb-3">
                内置完整的 HTTP 请求日志记录器。您可以查看每一次对话、每一次测活的<strong>完整 Request Body 和 Response Body</strong>，是调试 API 报错的利器。
              </p>
            </div>
          </div>

          {/* Section 3: Usage Tips */}
          <section className="border-t border-accents-2 pt-8">
            <h4 className="text-lg font-bold mb-6 flex items-center gap-2"><Icons.Zap size={20} /> 进阶技巧</h4>
            <div className="space-y-4">
               <div className="flex gap-4 items-start">
                  <div className="w-6 h-6 rounded bg-accents-2 flex items-center justify-center font-mono text-xs font-bold mt-0.5">1</div>
                  <div>
                    <strong className="block text-foreground text-sm mb-1">自定义 Headers 与 Parameters</strong>
                    <p className="text-sm text-accents-5">在添加连接的高级选项中，您可以注入自定义的 HTTP Header（如 <code>X-Custom-Auth</code>）或强制在 Body 中携带特定参数，适配各种魔改 API。</p>
                  </div>
               </div>
               <div className="flex gap-4 items-start">
                  <div className="w-6 h-6 rounded bg-accents-2 flex items-center justify-center font-mono text-xs font-bold mt-0.5">2</div>
                  <div>
                    <strong className="block text-foreground text-sm mb-1">提示词库 (Prompt Library)</strong>
                    <p className="text-sm text-accents-5">保存您常用的 System Prompt。在对话时，通过“上下文设置”快速导入，无需反复复制粘贴。</p>
                  </div>
               </div>
               <div className="flex gap-4 items-start">
                  <div className="w-6 h-6 rounded bg-accents-2 flex items-center justify-center font-mono text-xs font-bold mt-0.5">3</div>
                  <div>
                    <strong className="block text-foreground text-sm mb-1">导出精美长图</strong>
                    <p className="text-sm text-accents-5">在对话页面右上角，点击分享图标，可以将当前对话导出为精美的长图片或 PDF，方便分享到社交媒体。</p>
                  </div>
               </div>
            </div>
          </section>

          {/* Developer Credit Section */}
          <section className="mt-12 bg-accents-1 rounded-2xl p-8 text-center border border-accents-2">
             <div className="flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg text-white">
                   <Icons.Code size={32} />
                </div>
                <div>
                   <h3 className="text-xl font-bold text-foreground">Developed by Linux Do 三文鱼</h3>
                   <a 
                     href="https://linux.do/u/462642146/summary" 
                     target="_blank" 
                     rel="noopener noreferrer"
                     className="inline-flex items-center gap-2 mt-3 text-success hover:underline font-medium"
                   >
                     <Icons.ExternalLink size={16} /> 访问开发者主页
                   </a>
                </div>
                <p className="text-sm text-accents-5 max-w-md mx-auto">
                   致力于构建好用的本地化开发者工具。如果您觉得好用，欢迎分享给朋友。
                </p>
             </div>
          </section>

        </div>
      </div>
    </div>
  );

  if (isPage) return content;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-background w-full max-w-3xl h-[80vh] rounded-xl shadow-2xl flex flex-col border border-accents-2 overflow-hidden"
      >
        {content}
      </motion.div>
    </div>
  );
};