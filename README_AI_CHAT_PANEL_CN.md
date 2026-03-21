# AI 聊天面板集成说明

## 完成的工作

我已经成功为 Segmentation 模式创建了一个类似 ChatGPT 的 AI 对话聊天面板，替换了原来的右侧分割面板。

## 主要改动

### 1. 创建了新的聊天面板组件
**文件**: `extensions/default/src/Panels/ChatPanel.tsx`

功能特性:
- ✅ ChatGPT 风格的现代化界面
- ✅ 用户消息显示在右侧（蓝色气泡）
- ✅ AI 回复显示在左侧（灰色气泡）
- ✅ 自动滚动到最新消息
- ✅ 加载动画（正在输入的提示）
- ✅ 回车发送消息，Shift+Enter 换行
- ✅ 输入框自动调整高度
- ✅ 时间戳显示
- ✅ 响应式设计

### 2. 注册到扩展模块
**文件**: `extensions/default/src/getPanelModule.tsx`

将聊天面板注册为一个新的面板模块，供模式使用。

### 3. 修改 Segmentation 模式配置
**文件**: `modes/segmentation/src/index.tsx`

将右侧面板从分割面板更改为聊天面板：
```typescript
rightPanels: [
  '@ohif/extension-default.panelModule.chatPanel',
],
```

### 4. 添加国际化支持
**文件**:
- `platform/i18n/src/locales/en-US/ChatPanel.json` (翻译文件)
- `platform/i18n/src/locales/en-US/index.js` (注册翻译)

## 如何使用

1. **启动开发服务器**
   ```bash
   yarn install
   yarn dev
   ```

2. **访问应用**
   - 打开浏览器访问：http://localhost:3000
   - 选择一个研究
   - 选择 "Segmentation" 模式

3. **使用聊天面板**
   - 在右侧面板区域，点击 "AI Assistant" 标签
   - 在底部输入框输入问题
   - 按 Enter 键发送消息
   - 查看 AI 回复（目前是模拟响应）

## 接入真实 AI 后端

目前聊天面板使用的是模拟响应。要接入真实的 AI 服务（如 OpenAI GPT、文心一言、通义千问等），请查看:

**详细集成指南**: `AI_CHAT_PANEL_INTEGRATION.md`

该文档包含:
- API 集成示例代码
- 医疗图像上下文获取
- 安全性考虑
- HIPAA 合规建议
- 自定义选项

## 文件结构

```
extensions/default/src/Panels/
├── ChatPanel.tsx          (新建 - 聊天面板组件)
└── index.js               (修改 - 导出 ChatPanel)

extensions/default/src/
└── getPanelModule.tsx     (修改 - 注册聊天面板)

modes/segmentation/src/
└── index.tsx              (修改 - 配置使用聊天面板)

platform/i18n/src/locales/en-US/
├── ChatPanel.json         (新建 - 翻译文件)
└── index.js               (修改 - 注册翻译)
```

## 自定义选项

### 1. 修改 AI 头像或图标
编辑 `ChatPanel.tsx` 中的 SVG 图标

### 2. 更改配色方案
修改 Tailwind CSS 类名来自定义颜色

### 3. 同时显示分割面板和聊天面板
修改 `modes/segmentation/src/index.tsx`:
```typescript
rightPanels: [
  '@ohif/extension-default.panelModule.chatPanel',
  cornerstone.labelMapSegmentationPanel,
  cornerstone.contourSegmentationPanel,
],
```

### 4. 修改欢迎消息
在 `ChatPanel.tsx` 的 `useState` 初始化中修改

## 推荐的 AI 服务集成

### 国际服务
- OpenAI GPT-4/GPT-3.5
- Anthropic Claude
- Google PaLM

### 国内服务
- 百度文心一言
- 阿里通义千问
- 腾讯混元
- 讯飞星火

### 自建医疗 AI
可以部署开源医疗 AI 模型，如:
- Med-PaLM
- LLaVA-Med
- 其他医疗专用大语言模型

## 下一步

1. **选择 AI 服务提供商**
   - 根据您的需求选择合适的 AI 服务

2. **创建后端代理服务**
   - 不要在前端直接暴露 API 密钥
   - 创建 Node.js/Python 后端服务作为代理

3. **实现 API 调用**
   - 参考 `AI_CHAT_PANEL_INTEGRATION.md` 中的示例
   - 替换 `handleSendMessage` 函数中的模拟代码

4. **添加医疗图像上下文**
   - 获取当前研究信息
   - 获取测量数据
   - 获取分割结果
   - 将这些信息发送给 AI 以获得更准确的回答

5. **测试和优化**
   - 测试各种医疗影像相关问题
   - 优化响应速度
   - 确保符合医疗数据隐私规范

## 注意事项

⚠️ **重要提醒**:

1. **数据安全**: 不要在前端代码中硬编码 API 密钥
2. **HIPAA 合规**: 如果处理患者数据，确保 AI 服务符合 HIPAA 要求
3. **数据匿名化**: 发送到 AI 之前移除患者身份信息
4. **审计日志**: 记录所有 AI 交互用于合规和质量保证
5. **医疗责任**: AI 建议仅供参考，不应替代专业医疗判断

## 技术支持

如有问题，请参考:
- OHIF 官方文档
- OHIF 社区论坛
- 查看 `AI_CHAT_PANEL_INTEGRATION.md` 获取详细技术指南
