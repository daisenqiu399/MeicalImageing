# 🚀 立即修复：仍然看到演示回复

## 问题原因

你看到的仍然是演示回复，因为：
1. **AI 代理服务没有运行**，或者
2. **前端无法连接到代理服务**

---

## ✅ 快速修复（3 步解决）

### 第 1 步：安装依赖（如果还没安装）

```bash
npm install express cors dotenv node-fetch
```

### 第 2 步：启动 AI 代理服务

打开**新的终端窗口**，运行：

```bash
yarn ai:proxy
```

你应该看到：
```
🚀 AI Proxy Server running on port 3001
📝 Endpoint: http://localhost:3001/api/ai/chat
💡 DeepSeek API configured: true
```

### 第 3 步：清除浏览器缓存并刷新

1. 按 `Ctrl + Shift + Delete`
2. 选择"缓存的图片和文件"
3. 点击"清除数据"
4. 按 `Ctrl + F5` 强制刷新

---

## 🎯 最简单的解决方案

**一键启动所有服务**（推荐）：

```bash
yarn dev:with-ai
```

这个命令会同时启动：
- OHIF Viewer (端口 3000)
- AI 代理服务 (端口 3001)

不需要分开启动！

---

## 📋 完整测试流程

### 1. 启动服务

```bash
yarn dev:with-ai
```

等待看到：
```
[AI Proxy] 🚀 AI Proxy Server running on port 3001
[OHIF] Compiled successfully!
```

### 2. 打开浏览器

访问：http://localhost:3000

### 3. 选择模式

- 从工作列表选择一个研究
- 选择 "Segmentation" 模式

### 4. 打开右侧面板

- 点击右侧的 "AI Assistant" 标签
- 应该看到聊天界面

### 5. 发送测试消息

输入："你好，这是一个测试"

**如果正常工作**，你会在几秒内收到 DeepSeek AI 的真实回复。

**如果还是显示演示回复**，继续看下面的故障排除。

---

## 🔍 故障排除

### 问题 1: "Cannot find module 'express'"

**解决方法**：
```bash
npm install express cors dotenv node-fetch
```

### 问题 2: 代理服务器启动失败

**检查 .env 文件**：

```bash
# Windows PowerShell
Get-Content .env

# Mac/Linux
cat .env
```

应该显示：
```
DEEPSEEK_API_KEY=sk-62205b9e712b460d9ae027676cda8246
PROXY_PORT=3001
```

### 问题 3: 浏览器控制台显示错误

打开开发者工具（F12），查看控制台：

#### 错误："Failed to fetch"
**意思**：代理服务没运行或 URL 错误

**解决**：
```bash
# 确保代理服务在运行
yarn ai:proxy

# 或者重新启动
yarn dev:with-ai
```

#### 错误："Network request failed"
**意思**：端口 3001 被阻止

**解决**：
1. 检查防火墙设置
2. 尝试其他端口（修改 `.env` 中的 `PROXY_PORT`）

### 问题 4: 还是不行

运行测试脚本诊断：

```bash
node test-ai-proxy.js
```

这个脚本会：
- 检查健康状态
- 测试基本聊天
- 测试对话历史
- 显示详细的错误信息

---

## 💡 工作原理

```
你的浏览器              AI 代理服务           DeepSeek API
   │                        │                     │
   │  发送消息              │                     │
   ├───────────────────────>│                     │
   │                        │  转发请求（带密钥）  │
   │                        ├────────────────────>│
   │                        │                     │
   │                        │  AI 回复             │
   │                        <─────────────────────┤
   │  显示真实 AI 回复        │                     │
   │<───────────────────────┤                     │
```

**为什么需要代理？**
- 🔒 保护 API 密钥不被暴露给浏览器
- 🛡️ 防止密钥被盗用
- 📝 可以添加日志和监控
- ⚡ 可以实现缓存优化

---

## ✅ 成功标志

当一切正常时，你应该看到：

✅ 代理终端显示：`POST /api/ai/chat 200`
✅ 浏览器控制台显示：`✅ Received AI response:`
✅ 聊天显示真实的 AI 回复（不是演示文本）
✅ 浏览器控制台没有错误
✅ 健康检查返回 OK

---

## 🎨 改进后的错误提示

现在，如果连接失败，聊天面板会显示**详细的错误信息**，包括：

1. 如何启动代理服务
2. 具体的错误详情
3. 解决步骤

这会让你更容易诊断问题！

---

## 📱 使用示例

### 正常工作时

```
你：这个 CT 扫描显示了什么？

AI：这是一个胸部 CT 扫描的轴向切片。我可以看到肺
    部结构、心脏轮廓和纵隔结构...
```

### 连接失败时

```
你：这个 CT 扫描显示了什么？

AI: ⚠️ **Connection Error**

Could not connect to AI proxy server.

To fix this:

1. Make sure the proxy server is running:
   yarn ai:proxy

2. Or start both servers together:
   yarn dev:with-ai

3. Check that port 3001 is not blocked.

Error details: Failed to fetch
```

---

## 🔧 快速命令参考

```bash
# 只启动 AI 代理
yarn ai:proxy

# 同时启动 Viewer 和代理（推荐）
yarn dev:with-ai

# 测试代理是否正常
node test-ai-proxy.js

# 查看 .env 配置
Get-Content .env  # Windows
cat .env          # Mac/Linux

# 清除缓存（手动）
Ctrl + Shift + Delete → Clear data
```

---

## 🆘 终极解决方案

如果以上都不行，执行完全清理重装：

```bash
# 1. 停止所有服务
# 在所有终端按 Ctrl+C

# 2. 删除 node_modules
rm -rf node_modules

# 3. 重新安装
npm install express cors dotenv node-fetch
yarn install

# 4. 确保 .env 存在
echo DEEPSEEK_API_KEY=sk-62205b9e712b460d9ae027676cda8246 > .env

# 5. 启动
yarn dev:with-ai
```

---

## 📚 相关文档

- `FIX_DEMO_RESPONSE.md` - 详细英文故障排除指南
- `DEEPSEEK_QUICK_START_CN.md` - 中文快速入门
- `DEEPSEEK_INTEGRATION_GUIDE.md` - 完整技术文档

---

**最后更新**: 2026-03-15
**版本**: 1.1
**状态**: 已优化错误提示 ✅
