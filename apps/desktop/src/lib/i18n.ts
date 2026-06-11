/**
 * Minimal i18n system. Two languages: zh-CN (default) and en.
 * All UI strings should go through `t(key)` (imperative) or `useT()` (React hook).
 */
import { useSyncExternalStore } from "react";

export type Locale = "zh" | "en";

const translations: Record<string, Record<Locale, string>> = {
  // -- Navigation --------------------------------------------------------
  "nav.headquarters": { zh: "司令部", en: "Headquarters" },
  "nav.blueprint": { zh: "蓝图", en: "Blueprint" },
  "nav.patchboard": { zh: "接线板", en: "Patchboard" },
  "nav.atlas": { zh: "地图集", en: "Atlas" },
  "nav.editor": { zh: "编辑器", en: "Editor" },
  "nav.git": { zh: "Git", en: "Git" },
  "nav.terminal": { zh: "终端", en: "Terminal" },
  "nav.settings": { zh: "设置", en: "Settings" },

  // -- Notifications (A5: user-visible error states) --------------------
  "notif.dismiss": { zh: "关闭", en: "Dismiss" },
  "notif.lsp.failed.title": {
    zh: "TypeScript 语言服务异常",
    en: "TypeScript language server error",
  },
  "notif.lsp.failed.hint": {
    zh: "代码补全 / 跳转 / 诊断暂时不可用。重开工程或检查 Node 后重试。",
    en: "Code completion, go-to-definition and diagnostics are unavailable. Reopen the project or check Node, then retry.",
  },
  "notif.ai.failed.title": { zh: "AI 调用失败", en: "AI request failed" },
  "notif.ai.failed.hint.auth": {
    zh: "API 密钥缺失或无效，请在 设置 → AI 配置 中检查。",
    en: "API key missing or invalid — check Settings → AI Config.",
  },
  "notif.ai.failed.hint.generic": {
    zh: "请检查网络与 AI 配置后重试。",
    en: "Check your network and AI settings, then retry.",
  },
  "notif.ai.budgetExceeded.title": {
    zh: "已达月度 AI 预算上限",
    en: "Monthly AI budget reached",
  },
  "notif.ai.budgetExceeded.hint": {
    zh: "云端 AI 已暂停，本地模型仍可用。可在 设置 中调整预算。",
    en: "Cloud AI is paused; local models still work. Adjust the budget in Settings.",
  },
  "notif.ai.privacyBlocked.title": {
    zh: "隐私过滤器已拦截文件",
    en: "Privacy filter blocked a file",
  },
  "notif.ai.privacyBlocked.hint": {
    zh: "该文件不会发送给 AI。详见 .drafting/local/ai-audit.jsonl。",
    en: "This file was not sent to the AI. See .drafting/local/ai-audit.jsonl.",
  },
  "notif.ai.keyPlaintext.title": {
    zh: "API key 以明文存储",
    en: "API key stored as plaintext",
  },
  "notif.ai.keyPlaintext.hint": {
    zh: "系统钥匙串不可用，key 已写入 .drafting/keys/（仅当前用户可读，已确保不进 Git）。建议改用环境变量。",
    en: "System keychain unavailable; the key was written to .drafting/keys/ (owner-only, kept out of Git). Consider using an env var instead.",
  },
  "notif.codegen.failed.title": {
    zh: "代码生成失败",
    en: "Code generation failed",
  },
  "notif.codegen.failed.hint.node": {
    zh: "未找到 Node.js。请安装 Node ≥ 18 并确保它在 PATH 中。",
    en: "Node.js not found. Install Node ≥ 18 and make sure it is on your PATH.",
  },
  "notif.codegen.failed.hint.generic": {
    zh: "请查看上方错误详情。",
    en: "See the error details above.",
  },

  // -- Settings tabs ----------------------------------------------------
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.tab.general": { zh: "通用", en: "General" },
  "settings.tab.appearance": { zh: "外观", en: "Appearance" },
  "settings.tab.ai": { zh: "AI 配置", en: "AI Config" },
  "settings.tab.editor": { zh: "编辑器", en: "Editor" },
  "settings.tab.about": { zh: "关于", en: "About" },

  // -- General ----------------------------------------------------------
  "settings.language": { zh: "界面语言", en: "Language" },
  "settings.language.zh": { zh: "中文", en: "中文" },
  "settings.language.en": { zh: "English", en: "English" },

  // -- Appearance -------------------------------------------------------
  "settings.theme": { zh: "主题", en: "Theme" },
  "settings.fontFamily": { zh: "字体", en: "Font Family" },
  "settings.fontSize": { zh: "字号", en: "Font Size" },
  "settings.fontColor": { zh: "编辑器字体颜色", en: "Editor Font Color" },
  "settings.terminalFontColor": { zh: "终端字体颜色", en: "Terminal Font Color" },
  "settings.uiFontSize": { zh: "界面字号", en: "UI Font Size" },
  "settings.preview": { zh: "预览", en: "Preview" },

  // -- AI: top-level / global ------------------------------------------
  "settings.ai.title": { zh: "AI 功能", en: "AI Features" },
  "settings.ai.globalToggle": { zh: "启用 AI", en: "Enable AI" },
  "settings.ai.globalToggleDesc": {
    zh: "关闭后所有 AI 功能停用,核心工具仍可使用",
    en: "Disable to turn off all AI features. Core tools still work.",
  },
  "settings.ai.providers": { zh: "AI 提供商", en: "AI Providers" },
  "settings.ai.taskRouting": { zh: "任务路由", en: "Task Routing" },
  "settings.ai.usage": { zh: "用量", en: "Usage" },
  "settings.ai.currentMonth": { zh: "本月用量", en: "Current month" },
  "settings.ai.keySet": { zh: "已配置", en: "key set" },
  "settings.ai.setKey": { zh: "设置密钥", en: "Set Key" },
  "settings.ai.updateKey": { zh: "更新密钥", en: "Update Key" },

  // -- AI: profiles -----------------------------------------------------
  "settings.ai.profilesHeader": { zh: "AI Profiles", en: "AI Profiles" },
  "settings.ai.importFromClaude": { zh: "从 Claude Code 导入", en: "Import from Claude Code" },
  "settings.ai.importFromClaudeTip": {
    zh: "从 Claude Code (~/.claude) 或环境变量 ANTHROPIC_BASE_URL/API_KEY 中导入",
    en: "Import from Claude Code (~/.claude) or ANTHROPIC_BASE_URL/API_KEY env vars",
  },
  "settings.ai.newProfile": { zh: "新建", en: "New" },
  "settings.ai.builtin": { zh: "内置", en: "built-in" },
  "settings.ai.testConnection": { zh: "测试连接", en: "Test connection" },
  "settings.ai.testing": { zh: "测试中...", en: "Testing..." },
  "settings.ai.testOk": { zh: "✓ 连接正常", en: "✓ Connection OK" },
  "settings.ai.editProfile": { zh: "编辑", en: "Edit" },
  "settings.ai.cloneProfile": { zh: "克隆", en: "Clone" },
  "settings.ai.deleteProfile": { zh: "删除", en: "Delete" },
  "settings.ai.confirmDelete": {
    zh: '删除 profile "{name}"?路由会自动迁移到其他可用 profile。',
    en: 'Delete profile "{name}"? Routes will auto-migrate to another available profile.',
  },
  "settings.ai.toggleEnabled": { zh: "已启用 (点击禁用)", en: "Enabled (click to disable)" },
  "settings.ai.toggleDisabled": { zh: "已禁用 (点击启用)", en: "Disabled (click to enable)" },
  "settings.ai.needsKey": { zh: "未配置 API Key", en: "API key not configured" },
  "settings.ai.profileDeleted": { zh: "(已删除)", en: "(deleted)" },
  "settings.ai.modelPlaceholder": { zh: "选择模型", en: "Pick a model" },
  "settings.ai.modelCustom": { zh: "自定义", en: "custom" },
  "settings.ai.modelNoneAvailable": { zh: "Profile 无模型列表", en: "No models in profile" },

  // -- Workspace picker -------------------------------------------------
  "workspace.title": { zh: "工作区", en: "Workspace" },
  "workspace.current": { zh: "当前", en: "Current" },
  "workspace.openOther": { zh: "打开其他工程", en: "Open another project" },
  "workspace.pathPlaceholder": { zh: "粘贴绝对路径,如 /Users/me/my-project", en: "Paste absolute path, e.g. /Users/me/my-project" },
  "workspace.open": { zh: "打开", en: "Open" },
  "workspace.opening": { zh: "打开中…", en: "Opening…" },
  "workspace.recent": { zh: "最近打开", en: "Recent" },
  "workspace.errorEmpty": { zh: "路径不能为空", en: "Path cannot be empty" },
  "workspace.browseFolder": { zh: "选择文件夹…", en: "Choose Folder…" },
  "workspace.orPaste": { zh: "或粘贴:", en: "or paste:" },
  "settings.ai.bulkApplyLabel": { zh: "一键设置所有任务:", en: "Set all tasks to:" },
  "settings.ai.bulkPickProfile": { zh: "选 Profile", en: "Pick profile" },
  "settings.ai.bulkPickProfileFirst": { zh: "先选 Profile", en: "Pick profile first" },
  "settings.ai.bulkApplyButton": { zh: "应用到 {count} 个任务", en: "Apply to {count} tasks" },
  "settings.ai.bulkApplying": { zh: "应用中...", en: "Applying..." },
  "settings.ai.bulkApplied": { zh: "✓ 已应用到 {count} 个任务", en: "✓ Applied to {count} tasks" },
  "settings.ai.importedCount": { zh: "已导入 {n} 个 profile", en: "Imported {n} profile(s)" },
  "settings.ai.importedNone": { zh: "没有发现可导入的配置", en: "No importable config found" },
  "settings.ai.importFailed": { zh: "导入失败: {error}", en: "Import failed: {error}" },

  // -- AI: preset picker ------------------------------------------------
  "settings.ai.presets.title": { zh: "选择预设", en: "Choose a preset" },
  "settings.ai.presets.needsFill": { zh: "需填写", en: "needs filling" },

  // -- AI: profile editor dialog ----------------------------------------
  "settings.ai.editor.titleNew": { zh: "新建 Profile", en: "New Profile" },
  "settings.ai.editor.titleEdit": { zh: "编辑 · {name}", en: "Edit · {name}" },
  "settings.ai.editor.name": { zh: "名称", en: "Name" },
  "settings.ai.editor.protocol": { zh: "协议", en: "Protocol" },
  "settings.ai.editor.baseUrl": { zh: "Base URL", en: "Base URL" },
  "settings.ai.editor.endpointPath": {
    zh: "Endpoint Path (可空,默认按协议)",
    en: "Endpoint Path (empty = protocol default)",
  },
  "settings.ai.editor.authScheme": { zh: "鉴权方式", en: "Auth Scheme" },
  "settings.ai.editor.apiKey": { zh: "API Key", en: "API Key" },
  "settings.ai.editor.apiKeyKeep": { zh: "API Key (留空保留现有)", en: "API Key (empty = keep current)" },
  "settings.ai.editor.apiKeyExisting": {
    zh: "已设置 · 输入新值会覆盖",
    en: "Already set · entering a value will overwrite",
  },
  "settings.ai.editor.models": { zh: "模型列表 (每行一个)", en: "Models (one per line)" },
  "settings.ai.editor.extraHeaders": { zh: "额外 Headers (每行 'Name: Value')", en: "Extra Headers (one 'Name: Value' per line)" },
  "settings.ai.editor.urlPlaceholder": { zh: "https://api.example.com", en: "https://api.example.com" },
  "settings.ai.editor.headerNamePlaceholder": { zh: "Header 名称", en: "Header name" },
  "settings.ai.editor.headersPlaceholder": { zh: "Helicone-Auth: Bearer xxx", en: "Helicone-Auth: Bearer xxx" },
  "settings.ai.editor.modelsPlaceholder": {
    zh: "claude-sonnet-4-6\nclaude-haiku-4-5",
    en: "claude-sonnet-4-6\nclaude-haiku-4-5",
  },
  "settings.ai.editor.cancel": { zh: "取消", en: "Cancel" },
  "settings.ai.editor.save": { zh: "保存", en: "Save" },
  "settings.ai.editor.saving": { zh: "保存中...", en: "Saving..." },
  "settings.ai.editor.testFailed": { zh: "✗ {error}", en: "✗ {error}" },

  // Protocol display labels
  "settings.ai.protocol.anthropic": { zh: "Anthropic", en: "Anthropic" },
  "settings.ai.protocol.openai": { zh: "OpenAI 兼容", en: "OpenAI-compatible" },
  "settings.ai.protocol.ollama": { zh: "Ollama", en: "Ollama" },
  "settings.ai.protocol.anthropicOpt": {
    zh: "Anthropic /v1/messages (含中转)",
    en: "Anthropic /v1/messages (incl. proxies)",
  },
  "settings.ai.protocol.openaiOpt": {
    zh: "OpenAI 兼容 /v1/chat/completions",
    en: "OpenAI-compatible /v1/chat/completions",
  },
  "settings.ai.protocol.ollamaOpt": { zh: "Ollama /api/chat", en: "Ollama /api/chat" },

  // Auth scheme labels
  "settings.ai.auth.anthropic": { zh: "x-api-key (Anthropic)", en: "x-api-key (Anthropic)" },
  "settings.ai.auth.bearer": { zh: "Authorization: Bearer (OpenAI)", en: "Authorization: Bearer (OpenAI)" },
  "settings.ai.auth.custom": { zh: "自定义 Header", en: "Custom header" },
  "settings.ai.auth.none": { zh: "无鉴权 (Ollama / 内网)", en: "No auth (Ollama / intranet)" },

  // -- Editor settings panel -------------------------------------------
  "settings.editor.tabSize": { zh: "Tab 宽度", en: "Tab Size" },
  "settings.editor.wordWrap": { zh: "自动换行", en: "Word Wrap" },
  "settings.editor.minimap": { zh: "迷你地图", en: "Minimap" },
  "settings.editor.lineNumbers": { zh: "行号", en: "Line Numbers" },

  // -- About ------------------------------------------------------------
  "settings.about.name": { zh: "Drafting", en: "Drafting" },
  "settings.about.desc": {
    zh: "面向 Indie Hacker 的 AI 协作软件生产平台",
    en: "AI-collaborative software production platform for Indie Hackers",
  },
  "settings.about.version": { zh: "版本", en: "Version" },
  "settings.about.techStack": { zh: "技术栈", en: "Tech Stack" },

  // -- Task labels (shown in routing dropdown) -------------------------
  "task.editorCompletion": { zh: "代码补全", en: "Code Completion" },
  "task.editorChat": { zh: "编辑器对话", en: "Editor Chat" },
  "task.editorExplain": { zh: "代码解释", en: "Code Explain" },
  "task.editorRefactor": { zh: "代码重构", en: "Code Refactor" },
  "task.blueprintDraft": { zh: "蓝图起草", en: "Blueprint Draft" },
  "task.blueprintCheck": { zh: "蓝图检查", en: "Blueprint Check" },
  "task.blueprintSuggestCriteria": { zh: "建议准则", en: "Suggest Criteria" },
  "task.patchboardSuggestSocket": { zh: "建议 Socket", en: "Suggest Socket" },
  "task.patchboardSuggestAdapter": { zh: "建议 Adapter", en: "Suggest Adapter" },
  "task.gitCommitMessage": { zh: "提交消息", en: "Commit Message" },

  // -- AI Generate Dialog -----------------------------------------------
  "ai.generate": { zh: "生成", en: "Generate" },
  "ai.regenerate": { zh: "重新生成", en: "Regenerate" },
  "ai.stop": { zh: "停止", en: "Stop" },
  "ai.accept": { zh: "采纳", en: "Accept" },
  "ai.applying": { zh: "应用中...", en: "Applying..." },
  "ai.previewEditable": { zh: "(可直接编辑)", en: "(editable)" },
  "ai.streaming": { zh: "生成中…", en: "Streaming…" },
  "ai.preview": { zh: "预览", en: "Preview" },
  "ai.noProject": { zh: "未选择工程", en: "No project selected" },
  "ai.emptyInput": { zh: "请先输入描述", en: "Please enter a description first" },

  // -- AI Blueprint -----------------------------------------------------
  "blueprint.ai.draftTitle": { zh: "AI 起草 Blueprint", en: "AI Draft Blueprint" },
  "blueprint.ai.draftButton": { zh: "✨ AI 起草", en: "✨ AI Draft" },
  "blueprint.refreshList": { zh: "刷新列表(扫盘重建索引)", en: "Refresh list (rescan disk)" },
  "blueprint.ai.draftInputLabel": { zh: "特性描述", en: "Feature description" },
  "blueprint.ai.draftInputPlaceholder": {
    zh: "用一两句话描述这个特性,AI 会生成完整的 Blueprint 规格",
    en: "Describe the feature in one or two sentences; AI will draft a full Blueprint",
  },
  "blueprint.ai.suggestCriteriaTitle": { zh: "AI 建议 Acceptance Criteria", en: "AI Suggest Acceptance Criteria" },
  "blueprint.ai.suggestCriteriaButton": { zh: "✨ AI 建议", en: "✨ AI Suggest" },
  "blueprint.ai.suggestCriteriaInputLabel": { zh: "Goal(目标)", en: "Goal" },
  "blueprint.ai.suggestCriteriaInputPlaceholder": {
    zh: "描述特性的目标,AI 会建议 3-5 条验收准则",
    en: "Describe the goal; AI will suggest 3-5 acceptance criteria",
  },

  // -- AI Patchboard ----------------------------------------------------
  "patchboard.ai.suggestSocketTitle": { zh: "AI 建议 Socket", en: "AI Suggest Socket" },
  "patchboard.ai.suggestSocketButton": { zh: "✨ AI 建议", en: "✨ AI Suggest" },
  "patchboard.ai.suggestSocketInputLabel": { zh: "能力描述", en: "Capability description" },
  "patchboard.ai.suggestSocketInputPlaceholder": {
    zh: "描述这个 Socket 提供什么能力,AI 会建议接口签名",
    en: "Describe what this Socket should provide; AI will suggest the interface signature",
  },
  "patchboard.ai.suggestAdapterTitle": { zh: "AI 建议 Adapter", en: "AI Suggest Adapter" },
  "patchboard.ai.suggestAdapterButton": { zh: "✨ AI 建议", en: "✨ AI Suggest" },
  "patchboard.ai.suggestAdapterInputLabel": { zh: "实现描述", en: "Implementation description" },
  "patchboard.ai.suggestAdapterInputPlaceholder": {
    zh: "描述这个 Adapter 要做什么(例:用 OpenAI SDK 实现 LlmSocket),AI 会建议设计思路",
    en: "Describe what this Adapter should do (e.g. implement LlmSocket using OpenAI SDK)",
  },

  // -- Common -----------------------------------------------------------
  "common.save": { zh: "保存", en: "Save" },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.confirm": { zh: "确认", en: "Confirm" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.create": { zh: "创建", en: "Create" },
  "common.edit": { zh: "编辑", en: "Edit" },
  "common.close": { zh: "关闭", en: "Close" },
  "common.search": { zh: "搜索", en: "Search" },
  "common.loading": { zh: "加载中...", en: "Loading..." },
  "common.on": { zh: "开", en: "On" },
  "common.off": { zh: "关", en: "Off" },
  "common.reset": { zh: "重置", en: "Reset" },
  "common.default": { zh: "默认", en: "Default" },
  "common.none": { zh: "无", en: "None" },
  "common.refresh": { zh: "刷新", en: "Refresh" },
  "common.remove": { zh: "移除", en: "Remove" },
  "common.add": { zh: "添加", en: "Add" },
  "common.ready": { zh: "就绪", en: "Ready" },
  "common.matches": { zh: "匹配", en: "matches" },

  // -- Headquarters -----------------------------------------------------
  "hq.features": { zh: "特性", en: "Features" },
  "hq.alerts": { zh: "警报", en: "Alerts" },
  "hq.todo": { zh: "待办", en: "Todo" },
  "hq.noAlerts": { zh: "无警报", en: "No alerts" },
  "hq.noPendingCriteria": { zh: "无待办准则", en: "No pending criteria" },
  "hq.recentActivity": { zh: "最近活动", en: "Recent Activity" },
  "hq.aiConfig": { zh: "AI 配置", en: "AI Config" },
  "hq.quickActions": { zh: "快捷操作", en: "Quick Actions" },
  "hq.newBlueprint": { zh: "新建蓝图", en: "New Blueprint" },
  "hq.openPatchboard": { zh: "打开接线板", en: "Open Patchboard" },
  "hq.configureAi": { zh: "配置 AI", en: "Configure AI" },
  "hq.noFeatures": { zh: "暂无特性", en: "No features yet" },
  "hq.createBlueprint": { zh: "创建蓝图来定义你的第一个特性", en: "Create a Blueprint to define your first feature." },
  "hq.welcome": { zh: "欢迎使用 Drafting,开始创建你的第一个蓝图。", en: "Welcome to Drafting. Start by creating your first Blueprint." },
  "hq.featureSort": { zh: "排序", en: "Sort" },
  "hq.featureFilter": { zh: "过滤", en: "Filter" },
  "hq.sort.priority": { zh: "优先级", en: "Priority" },
  "hq.sort.progress": { zh: "进度", en: "Progress" },
  "hq.sort.updated": { zh: "更新时间", en: "Updated" },
  "hq.sort.name": { zh: "名称", en: "Name" },
  "hq.filter.all": { zh: "全部", en: "All" },
  "hq.filter.inProgress": { zh: "进行中", en: "In Progress" },
  "hq.filter.withAlerts": { zh: "有警报", en: "With Alerts" },
  "hq.filter.stalled": { zh: "停滞", en: "Stalled" },
  "hq.filter.empty": { zh: "空白", en: "Empty" },
  "hq.filter.completed": { zh: "已完成", en: "Completed" },
  "hq.alertMode.expanded": { zh: "展开", en: "Expanded" },
  "hq.alertMode.collapsed": { zh: "折叠", en: "Collapsed" },
  "hq.alertMode.badge": { zh: "徽章", en: "Badge" },

  // -- Editor -----------------------------------------------------------
  "editor.explorer": { zh: "资源管理器", en: "Explorer" },
  "editor.selectFile": { zh: "从左侧选择文件来编辑", en: "Select a file from the file tree to edit." },
  "editor.toolGenerated": {
    zh: "🔒 此文件由工具生成,请在 Patchboard 中编辑",
    en: "🔒 This file is tool-generated. Edit in Patchboard instead.",
  },
  "editor.statusReady": { zh: "就绪", en: "Ready" },
  "editor.loading": { zh: "加载中...", en: "Loading..." },

  // -- Terminal ---------------------------------------------------------
  "terminal.newTab": { zh: "新建终端 (Cmd+T)", en: "New terminal (Cmd+T)" },
  "terminal.launchClaude": { zh: "启动 Claude Code (Cmd+Shift+C)", en: "Launch Claude Code (Cmd+Shift+C)" },
  "terminal.launchCodex": { zh: "启动 Codex (Cmd+Shift+X)", en: "Launch Codex (Cmd+Shift+X)" },
  "terminal.starting": { zh: "正在启动 shell...", en: "Starting shell..." },
  "terminal.history.placeholder": { zh: "搜索历史…", en: "Search history…" },
  "terminal.history.empty": { zh: "未找到匹配命令", en: "No matching commands" },
  "terminal.history.help": {
    zh: "↑↓ 导航 · Enter 插入 · Esc 关闭",
    en: "↑↓ navigate · Enter insert · Esc close",
  },
  "terminal.confirmClose": {
    zh: '"{path}" 有未保存改动,仍要关闭吗?',
    en: '"{path}" has unsaved changes. Close anyway?',
  },

  // -- Git --------------------------------------------------------------
  "git.loadingStatus": { zh: "正在加载 Git 状态...", en: "Loading Git status..." },
  "git.notARepo": { zh: "不是 Git 仓库", en: "Not a Git repository" },
  "git.notARepoDesc": {
    zh: "当前工作目录不是 Git 仓库。",
    en: "The current working directory is not a Git repository.",
  },
  "git.refresh": { zh: "刷新", en: "Refresh" },
  "git.staged": { zh: "已暂存", en: "Staged" },
  "git.changes": { zh: "改动", en: "Changes" },
  "git.stageAll": { zh: "全部暂存", en: "Stage all" },
  "git.history": { zh: "提交历史", en: "History" },
  "git.noCommits": { zh: "暂无提交。", en: "No commits yet." },
  "git.selectForDiff": { zh: "选择文件查看差异", en: "Select a file to view its diff" },
  "git.binaryOrUntracked": { zh: "无差异 (二进制或未追踪)", en: "No diff (binary or untracked)" },
  "git.detached": { zh: "(分离 HEAD)", en: "(detached)" },

  // -- Git Commit Box ---------------------------------------------------
  "git.commit.title": { zh: "提交消息", en: "Commit message" },
  "git.commit.aiGenerate": { zh: "AI 生成", en: "AI" },
  "git.commit.stop": { zh: "停止", en: "Stop" },
  "git.commit.stopTip": { zh: "停止生成", en: "Stop generation" },
  "git.commit.aiTip": { zh: "用 AI 生成", en: "Generate with AI" },
  "git.commit.stageFirst": { zh: "请先暂存改动", en: "Stage changes first" },
  "git.commit.placeholder": { zh: "描述你的改动…", en: "Describe your change…" },
  "git.commit.generating": { zh: "生成中...", en: "Generating..." },
  "git.commit.button": { zh: "提交 ({count})", en: "Commit ({count})" },
  "git.commit.noProject": { zh: "未打开任何项目", en: "No project open" },
  "git.commit.diffFailed": { zh: "无法读取已暂存差异: {error}", en: "Could not read staged diff: {error}" },
  "git.commit.noStaged": { zh: "没有已暂存的改动可描述", en: "No staged changes to describe" },

  // -- Patchboard -------------------------------------------------------
  "patchboard.canvases": { zh: "画布", en: "Canvases" },
  "patchboard.newCanvas": { zh: "新建画布", en: "New Canvas" },
  "patchboard.canvasNamePlaceholder": { zh: "画布名称…", en: "Canvas name..." },
  "patchboard.create": { zh: "创建", en: "Create" },
  "patchboard.cancel": { zh: "取消", en: "Cancel" },
  "patchboard.addAdapter": { zh: "添加适配器", en: "Add Adapter" },
  "patchboard.validateCanvas": { zh: "校验画布", en: "Validate Canvas" },
  "patchboard.generateCode": { zh: "生成代码", en: "Generate Code" },
  "patchboard.deleteCanvas": { zh: "删除画布", en: "Delete Canvas" },
  "patchboard.adapterNamePlaceholder": { zh: "例如 PostgresAdapter", en: "e.g. PostgresAdapter" },

  // Registry / Sockets
  "patchboard.sockets": { zh: "Socket", en: "Sockets" },
  "patchboard.newSocket": { zh: "新建 Socket", en: "New Socket" },
  "patchboard.fullNamePlaceholder": { zh: "例如 auth/IAuthService", en: "e.g. auth/IAuthService" },
  "patchboard.displayNamePlaceholder": { zh: "例如 Auth Service", en: "e.g. Auth Service" },
  "patchboard.methodNamePlaceholder": { zh: "方法名", en: "method name" },
  "patchboard.returnTypePlaceholder": { zh: "返回类型", en: "return type" },
  "patchboard.paramPlaceholder": { zh: "参数", en: "param" },
  "patchboard.typePlaceholder": { zh: "类型", en: "type" },
  "patchboard.implements": { zh: "实现的 Socket", en: "Implements" },
  "patchboard.implementsNone": { zh: "无", en: "None" },

  // -- Atlas ------------------------------------------------------------
  "atlas.title": { zh: "地图集", en: "Atlas" },
  "atlas.empty": { zh: "打开一个文件查看其结构。", en: "Open a file to view its structure." },
  "atlas.viewInPatchboard": { zh: "在 Patchboard 中查看", en: "View in Patchboard" },
  "atlas.viewBlueprint": { zh: "查看蓝图", en: "View Blueprint" },

  // -- Blueprint --------------------------------------------------------
  "blueprint.newBlueprint": { zh: "新建蓝图", en: "New Blueprint" },
  "blueprint.features": { zh: "特性", en: "Features" },
  "blueprint.files": { zh: "文件", en: "Files" },
  "blueprint.createFromTemplate": { zh: "从模板创建", en: "Create from Template" },
  "blueprint.check": { zh: "检查", en: "Check" },
  "blueprint.delete": { zh: "删除", en: "Delete" },
  "blueprint.tagsPlaceholder": { zh: "用逗号分隔", en: "comma-separated" },
  "blueprint.criterionRemove": { zh: "移除", en: "Remove" },
  "blueprint.featureNamePlaceholder": { zh: "例如 用户认证", en: "e.g. User Authentication" },
  "blueprint.loading": { zh: "加载中...", en: "Loading..." },

  // -- Search Dialog ----------------------------------------------------
  "search.placeholder": { zh: "搜索文件...", en: "Search in files..." },
  "search.regexPlaceholder": { zh: "用正则搜索...", en: "Search with regex..." },
  "search.matchCase": { zh: "区分大小写", en: "Match case" },
  "search.wholeWord": { zh: "全词匹配", en: "Whole word" },
  "search.regex": { zh: "正则", en: "Regex" },
  "search.filters": { zh: "过滤器", en: "Filters" },
  "search.includeGlob": { zh: "包含的文件 (例如 src/**/*.ts)", en: "files to include (e.g. src/**/*.ts)" },
  "search.excludeGlob": { zh: "排除的文件", en: "files to exclude" },
  "search.searching": {
    zh: "搜索中… 已扫描 {scanned} 个文件 · {matches} 个匹配,{files} 个文件",
    en: "Searching… {scanned} files scanned · {matches} matches in {files} files",
  },
  "search.cancelled": {
    zh: "已取消 · {matches} 个匹配,{files} 个文件",
    en: "Cancelled · {matches} matches in {files} files",
  },
  "search.results": {
    zh: "{matches} 个匹配,{files} 个文件{truncated}",
    en: "{matches} matches in {files} files{truncated}",
  },
  "search.truncated": { zh: " (已截断)", en: " (truncated)" },
  "search.noResults": { zh: "无结果", en: "No results found" },
  "search.error": { zh: "错误: {error}", en: "Error: {error}" },

  // -- Command palette --------------------------------------------------
  "palette.placeholder": { zh: "输入命令或搜索…", en: "Type a command or search..." },

  // -- Right panel ------------------------------------------------------
  "panel.showFiles": { zh: "显示文件", en: "Show Files" },
  "panel.hideFiles": { zh: "隐藏文件", en: "Hide Files" },

  // -- Sidebar ----------------------------------------------------------
  "sidebar.theme": { zh: "主题", en: "Theme" },
};

let currentLocale: Locale = "zh";

const STORAGE_KEY = "drafting.locale";
const subscribers = new Set<() => void>();

export function initLocale(): void {
  if (typeof window === "undefined") return;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "zh" || stored === "en") {
    currentLocale = stored;
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  for (const fn of subscribers) fn();
}

function subscribeLocale(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Translate a key to the current locale.
 * Returns the key itself if not found.
 *
 * Imperative — useful in non-React contexts (window.alert, command strings,
 * etc). React components should prefer `useT()` so they re-render on locale
 * change.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = translations[key];
  const raw = entry ? entry[currentLocale] ?? entry.en ?? key : key;
  return interpolate(raw, vars);
}

/**
 * React hook that returns a `t` function bound to the *current* locale,
 * and re-renders when the locale changes.
 */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return (key, vars) => {
    const entry = translations[key];
    const raw = entry ? entry[locale] ?? entry.en ?? key : key;
    return interpolate(raw, vars);
  };
}

/** `{name}` style placeholder substitution. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

initLocale();
