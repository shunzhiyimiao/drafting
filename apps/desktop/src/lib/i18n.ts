/**
 * Minimal i18n system. Two languages: zh-CN (default) and en.
 * All UI strings go through `t(key)`.
 */

export type Locale = "zh" | "en";

const translations: Record<string, Record<Locale, string>> = {
  // -- Navigation --
  "nav.headquarters": { zh: "司令部", en: "Headquarters" },
  "nav.blueprint": { zh: "蓝图", en: "Blueprint" },
  "nav.patchboard": { zh: "接线板", en: "Patchboard" },
  "nav.atlas": { zh: "地图集", en: "Atlas" },
  "nav.editor": { zh: "编辑器", en: "Editor" },
  "nav.git": { zh: "Git", en: "Git" },
  "nav.terminal": { zh: "终端", en: "Terminal" },
  "nav.settings": { zh: "设置", en: "Settings" },

  // -- Settings tabs --
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.tab.general": { zh: "通用", en: "General" },
  "settings.tab.appearance": { zh: "外观", en: "Appearance" },
  "settings.tab.ai": { zh: "AI 配置", en: "AI Config" },
  "settings.tab.editor": { zh: "编辑器", en: "Editor" },
  "settings.tab.about": { zh: "关于", en: "About" },

  // -- General --
  "settings.language": { zh: "界面语言", en: "Language" },
  "settings.language.zh": { zh: "中文", en: "Chinese" },
  "settings.language.en": { zh: "英文", en: "English" },

  // -- Appearance --
  "settings.theme": { zh: "主题", en: "Theme" },
  "settings.fontFamily": { zh: "字体", en: "Font Family" },
  "settings.fontSize": { zh: "字号", en: "Font Size" },
  "settings.fontColor": { zh: "编辑器字体颜色", en: "Editor Font Color" },
  "settings.terminalFontColor": { zh: "终端字体颜色", en: "Terminal Font Color" },
  "settings.uiFontSize": { zh: "界面字号", en: "UI Font Size" },
  "settings.preview": { zh: "预览", en: "Preview" },

  // -- AI --
  "settings.ai.title": { zh: "AI 功能", en: "AI Features" },
  "settings.ai.globalToggle": { zh: "启用 AI", en: "Enable AI" },
  "settings.ai.globalToggleDesc": {
    zh: "关闭后所有 AI 功能停用，核心工具仍可使用",
    en: "Disable to turn off all AI features. Core tools still work.",
  },
  "settings.ai.providers": { zh: "AI 提供商", en: "AI Providers" },
  "settings.ai.setKey": { zh: "设置密钥", en: "Set Key" },
  "settings.ai.updateKey": { zh: "更新密钥", en: "Update Key" },
  "settings.ai.keySet": { zh: "已配置", en: "key set" },
  "settings.ai.taskRouting": { zh: "任务路由", en: "Task Routing" },
  "settings.ai.usage": { zh: "用量", en: "Usage" },
  "settings.ai.currentMonth": { zh: "本月用量", en: "Current month" },

  // -- Editor --
  "settings.editor.tabSize": { zh: "Tab 宽度", en: "Tab Size" },
  "settings.editor.wordWrap": { zh: "自动换行", en: "Word Wrap" },
  "settings.editor.minimap": { zh: "迷你地图", en: "Minimap" },
  "settings.editor.lineNumbers": { zh: "行号", en: "Line Numbers" },

  // -- About --
  "settings.about.name": { zh: "Drafting", en: "Drafting" },
  "settings.about.desc": {
    zh: "面向 Indie Hacker 的 AI 协作软件生产平台",
    en: "AI-collaborative software production platform for Indie Hackers",
  },
  "settings.about.version": { zh: "版本", en: "Version" },
  "settings.about.techStack": { zh: "技术栈", en: "Tech Stack" },

  // -- Task labels --
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

  // -- Common --
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

  // -- Headquarters --
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
  "hq.welcome": { zh: "欢迎使用 Drafting，开始创建你的第一个蓝图。", en: "Welcome to Drafting. Start by creating your first Blueprint." },
};

let currentLocale: Locale = "zh";

const STORAGE_KEY = "drafting.locale";

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
  currentLocale = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

/**
 * Translate a key to the current locale.
 * Returns the key itself if not found.
 */
export function t(key: string): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[currentLocale] ?? entry.en ?? key;
}

// Initialize on import
initLocale();
