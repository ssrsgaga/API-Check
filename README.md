# OmniProbe (API Check)

一个轻量、现代化的 LLM API 连通性测试与调试工具。

OmniProbe 是一个纯前端应用（Pure Frontend），旨在帮助开发者快速验证 OpenAI 格式接口的可用性、延迟以及功能支持情况（如 Function Calling）。所有数据（API Key、聊天记录、设置）均存储在浏览器本地（LocalStorage & IndexedDB），不经过任何第三方服务器，确保隐私安全。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

## ✨ 核心特性

*   **🛡️ 隐私优先**：无后端架构，你的 Key 永远只保存在你自己的浏览器里。
*   **⚡ 快速测活**：
    *   **基础测试**：检测 API 连通性、响应延迟。
    *   **深度验证**：不仅仅是 Ping 通，还能检测模型是否真的支持 **Function Calling**（工具调用），防止“假冒”模型。
    *   **批量矩阵测试**：输入 N 个 Key 和 M 个模型，自动构建测试矩阵，快速筛选可用组合，支持导出 CSV/JSON 报告。
*   **💬 调试控制台**：
    *   支持流式输出 (SSE) 和非流式调试。
    *   **多模态支持**：支持发送图片进行视觉模型测试。
    *   **参数微调**：实时调整 Temperature, Top P, Max Tokens 等参数。
    *   **上下文管理**：内置提示词库 (Prompt Library)，可快速注入 System Prompt。
*   **🔍 审计日志**：内置完整的请求日志记录器，可查看每一次调用的 Header、Request Body 和 Response Body，方便排查 API 报错。
*   **🪄 智能填入**：粘贴杂乱的 API 配置文本（如群聊转发的配置），AI 自动提取 BaseURL 和 Key 并填入。
*   **🎨 现代化 UI**：Vercel 风格设计，支持深色/浅色模式切换，移动端适配。

## 🛠️ 技术栈

本项目基于 React 生态构建：

*   **框架**: React 19 + TypeScript
*   **构建工具**: Vite (推荐)
*   **样式**: Tailwind CSS
*   **图标**: Lucide React
*   **动画**: Framer Motion
*   **存储**: IndexedDB (日志存储) + LocalStorage (配置存储)
*   **导出**: html2canvas + jsPDF (聊天记录导出)

## 🚀 快速开始

### 开发环境运行

1.  **克隆项目**

    ```bash
    git clone https://github.com/your-username/omniprobe.git
    cd omniprobe
    ```

2.  **安装依赖**

    ```bash
    npm install
    # 或者
    yarn install
    # 或者
    pnpm install
    ```

3.  **启动开发服务器**

    ```bash
    npm run dev
    ```

4.  打开浏览器访问 `http://localhost:5173`。

### 部署

由于是纯静态项目，你可以将其部署到任何静态托管服务上：

*   **Vercel**: 导入仓库即可自动识别部署。
*   **GitHub Pages**: 构建后上传 `dist` 目录。
*   **Nginx / Docker**: 只需要托管构建后的静态文件。

## 📖 使用指南

### 1. 添加 API 连接
点击侧边栏的“添加连接”。
*   **标准模式**：支持 OpenAI、DeepSeek、SiliconFlow 等标准接口。
*   **智能填入**：点击输入框旁的魔法棒图标，粘贴包含 Key 和 URL 的文本，让 AI 帮你解析。
*   **自定义 Headers**：如果是特殊的中转服务，可以在“高级设置”中添加自定义 Header（如 `X-Custom-Auth`）。

### 2. 批量测活 (Bulk Test)
当你手头有一批 Key 需要筛选时：
1.  进入“批量测活”页面。
2.  输入接口地址（Base URL）。
3.  粘贴所有的 API Key（一行一个）。
4.  选择或输入你想测试的模型（如 `gpt-4o`, `claude-3-5-sonnet`）。
5.  点击开始，系统会并发测试所有组合，并生成可视化矩阵报告。

### 3. 日志审计
遇到 API 报错不知道原因？
进入“操作日志”页面，点击具体的请求记录，你可以看到完整的 JSON 请求体和服务器返回的原始错误信息。这对于调试参数格式错误非常有帮助。

## 🤝 贡献

欢迎提交 Issue 和 PR。如果你发现有什么新的 API 格式不支持，或者有好的功能建议，请直接告诉我们。

## 📄 许可证

MIT License. 所有的代码都是开源的，你可以随意修改和分发。