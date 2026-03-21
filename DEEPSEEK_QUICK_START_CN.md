# DeepSeek AI 集成快速入门

## 🚀 5 分钟快速开始

### 第一步：安装依赖

```bash
# 在项目根目录执行
npm install express cors dotenv concurrently
```

或者使用快速启动脚本（Windows）：
```bash
.\setup-and-run-ai.bat
```

### 第二步：检查环境配置

确保 `.env` 文件存在并包含你的 API 密钥：

```bash
# .env 文件内容
DEEPSEEK_API_KEY=sk-62205b9e712b460d9ae027676cda8246
PROXY_PORT=3001
```

**⚠️ 重要**：`.env` 文件已添加到 `.gitignore`，不会被提交到代码库！

### 第三步：启动服务

#### 方法 A：同时启动两个服务（推荐）

```bash
yarn dev:with-ai
```

你会看到：
```
🚀 AI Proxy Server running on port 3001
[OHIF] Compiled successfully!
```

#### 方法 B：分别启动

终端 1 - 启动 AI 代理：
```bash
yarn ai:proxy
```

终端 2 - 启动 OHIF Viewer：
```bash
yarn dev
```

### 第四步：测试功能

1. **打开浏览器**: http://localhost:3000
2. **选择 Segmentation 模式**
3. **打开右侧面板** → 点击 "AI Assistant" 标签
4. **发送消息**: "你能帮我分析这个影像吗？"
5. **查看回复**: AI 应该在几秒内回复

## ✅ 验证集成成功

### 检查点

- [ ] AI Proxy 服务启动在 3001 端口
- [ ] OHIF Viewer 启动在 3000 端口
- [ ] 右侧面板显示 "AI Assistant" 标签
- [ ] 可以发送消息
- [ ] AI 能够回复消息

### 测试命令

```bash
# 测试 AI 代理是否正常
curl -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Hello\",\"conversationHistory\":[]}"
```

应该返回 JSON 格式的 AI 回复。

## 🔧 常见问题

### 问题 1: "Cannot find module 'express'"
**解决**:
```bash
npm install express cors dotenv concurrently
```

### 问题 2: "Invalid API key"
**解决**:
1. 检查 `.env` 文件中的 API 密钥是否正确
2. 确保没有多余的空格或引号
3. 重启代理服务

### 问题 3: 代理服务器启动但无法连接
**解决**:
1. 检查防火墙是否阻止 3001 端口
2. 确认没有其他程序占用 3001 端口
3. 尝试重启计算机后重新运行

### 问题 4: ChatPanel 没有调用代理
**解决**:
1. 清除浏览器缓存（Ctrl+Shift+Delete）
2. 硬刷新页面（Ctrl+F5）
3. 检查浏览器控制台是否有错误

## 📊 架构说明

```
用户浏览器          AI 代理服务器        DeepSeek API
   │                    │                    │
   │  发送消息          │                    │
   ├───────────────────>│                    │
   │                    │  转发请求          │
   │                    ├───────────────────>│
   │                    │                    │
   │                    │  AI 响应            │
   │                    <────────────────────┤
   │  显示回复          │                    │
   │<───────────────────┤                    │
   │                    │                    │
```

**为什么需要代理服务器？**
- 🔒 保护 API 密钥不被暴露
- 🛡️ 防止密钥被盗用
- 📝 可以添加日志和监控
- ⚡ 可以实现缓存优化

## 🎯 功能特性

### ✅ 已实现
- ✅ 安全的 API 密钥管理
- ✅ 对话历史支持
- ✅ 错误处理和重试
- ✅ 加载状态显示
- ✅ 医学影像上下文感知

### 🔜 计划实现
- 🔄 自动注入医学图像上下文
- 📏 支持测量和分割数据
- 🌊 流式响应
- 🎨 自定义 AI 角色
- 💾 本地缓存优化

## ⚙️ 配置选项

### 修改 AI 模型
编辑 `server/ai-proxy.js`:
```javascript
model: 'deepseek-chat',  // 可用的模型
```

### 调整温度参数
控制回复的创造性（0 = 确定，1 = 随机）:
```javascript
temperature: 0.7,  // 平衡（推荐）
```

### 修改最大 Token 数
控制回复长度:
```javascript
max_tokens: 1000,  // 默认值
```

### 自定义系统提示词
修改 AI 的行为:
```javascript
function buildSystemPrompt(context) {
  return `你是一个专业的医学影像 AI 助手...`;
}
```

## 💰 成本估算

DeepSeek 定价示例：
- 输入：$0.001 / 1K tokens
- 输出：$0.002 / 1K tokens

**月度估算**（100 个活跃用户）:
- 每天：500K tokens ≈ $1.00
- 每月：≈ $30.00

## 🔒 安全提醒

### ⚠️ 绝对不要：
- ❌ 把 `.env` 提交到 Git
- ❌ 在客户端代码中硬编码 API 密钥
- ❌ 直接从浏览器调用 DeepSeek API
- ❌ 公开分享你的 API 密钥

### ✅ 一定要：
- ✅ 使用环境变量存储密钥
- ✅ 通过代理服务器调用 API
- ✅ 在生产环境使用 HTTPS
- ✅ 实施速率限制

## 📱 使用示例

### 基本对话
```
用户：这个 CT 扫描显示了什么？
AI: 这是一个胸部 CT 扫描的轴向切片。我可以看到...
```

### 询问测量值
```
用户：这个病变的大小是多少？
AI: 根据当前的测量，病变的尺寸约为...
```

### 寻求建议
```
用户：我应该使用哪种重建算法？
AI: 对于这个临床应用，我建议考虑...
```

## 🆘 故障排除

### 查看日志
代理服务会显示详细日志：
```
POST /api/ai/chat 200 - - ms
DeepSeek API Response: {...}
```

### 调试模式
在 `.env` 中添加：
```
LOG_LEVEL=debug
```

### 测试连接
```bash
# 健康检查
curl http://localhost:3001/health
```

## 📚 相关文档

- `DEEPSEEK_INTEGRATION_GUIDE.md` - 完整技术指南（英文）
- `TROUBLESHOOTING_CHAT_PANEL.md` - 聊天面板故障排除
- `CHAT_PANEL_FIX_STEPS.md` - 快速修复步骤

## 🎉 成功标志

当一切正常时，你应该看到：

✅ 代理服务在 3001 端口运行
✅ OHIF 在 3000 端口运行
✅ 所有模式都有 AI Assistant 标签
✅ 可以发送和接收消息
✅ 控制台没有错误

---

**最后更新**: 2026-03-15
**版本**: 1.0
**状态**: 生产就绪 ✅
