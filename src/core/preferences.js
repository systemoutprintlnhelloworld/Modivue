// Appearance and interaction options are shared by the form and persistence.
export const optionalViews = { models: "模型", routes: "路由", cache: "Cache", ttft: "TTFT", cost: "花费统计", alerts: "告警", logs: "日志" };
export const preferenceFields = [
  ...Object.entries(optionalViews).map(([view, label]) => ({ key: `tabShow_${view}`, label: `显示${label}标签页`, group: "display", type: "boolean", value: true })),
  { key: "locale", label: "界面语言", group: "appearance", options: { "zh-CN": "简体中文", en: "English", system: "跟随系统" }, value: "system" },
  { key: "themePreset", label: "界面主题", group: "appearance", options: { system: "跟随系统", graphite: "石墨", glass: "毛玻璃", catppuccin: "Catppuccin Mocha", dracula: "Dracula", light: "浅色", custom: "自定义颜色" }, value: "system" },
  { key: "mainBackground", label: "主窗口背景", group: "appearance", type: "color", value: "#11141a" },
  { key: "panelBackground", label: "卡片背景", group: "appearance", type: "color", value: "#191d25" },
  { key: "textColor", label: "主窗口文字", group: "appearance", type: "color", value: "#f5f7fa" },
  { key: "customTextColor", label: "使用自定义文字色", hint: "可在任何主题上覆盖正文文字色；指标状态颜色单独保留", group: "appearance", type: "boolean", value: false },
  { key: "fontScale", label: "文字大小", hint: "只调整文字，不缩放环和窗口几何", group: "appearance", min: 80, max: 200, unit: "%", value: 100 },
  { key: "accentColor", label: "主窗口强调色", group: "appearance", type: "color", value: "#75b9ff" },
  { key: "normalBackground", label: "普通形态背景", group: "appearance", type: "color", value: "#101217" },
  { key: "focusBackground", label: "专注形态背景", group: "appearance", type: "color", value: "#101217" },
  { key: "popoverBackground", label: "悬浮详情背景", group: "appearance", type: "color", value: "#101217" },
  { key: "islandOpacity", label: "灵动岛不透明度", group: "appearance", min: 0, max: 100, unit: "%", value: 94 },
  { key: "panelRadius", label: "主窗口卡片圆角", group: "appearance", min: 0, max: 32, unit: "px", value: 12 },
  { key: "islandShape", label: "灵动岛轮廓", group: "appearance", options: { pill: "椭圆胶囊", rounded: "圆角矩形", square: "小圆角" }, value: "pill" },
  { key: "islandMaxAgents", label: "普通形态最多显示目标", hint: "按模型、渠道、Key、推理档位去重；超过上限时悬停上下边界滚动", group: "interaction", min: 1, max: 12, unit: "个", value: 5 },
  { key: "islandScrollSpeed", label: "边界滚动速度", group: "interaction", min: 30, max: 360, unit: "px/s", value: 110 },
  { key: "islandScale", label: "灵动岛整体比例", hint: "环、间距、操作杆一起缩放，高度随内容自动适应", group: "interaction", min: 10, max: 200, unit: "%", value: 100 },
  { key: "islandExpandedWidth", label: "灵动岛展开宽度", hint: "调整展开详情的原生窗口宽度", group: "interaction", min: 320, max: 900, unit: "px", value: 570 },
  { key: "animationDurationMs", label: "形态过渡时长", group: "interaction", min: 150, max: 900, unit: "ms", value: 420 },
  { key: "focusDwellMs", label: "普通到专注停留", hint: "首次进入至少保留 550ms 普通形态", group: "interaction", min: 150, max: 2000, unit: "ms", value: 350 },
  { key: "collapseDelayMs", label: "离开收起延迟", group: "interaction", min: 100, max: 1500, unit: "ms", value: 360 },
  { key: "hoverDetails", label: "专注形态显示悬浮详情", group: "interaction", type: "boolean", value: true },
  { key: "clickThroughIsland", label: "灵动岛穿透模式", hint: "开启后灵动岛不拦截鼠标；需要交互时可在设置中关闭", group: "interaction", type: "boolean", value: false },
  { key: "notifications", label: "系统通知", hint: "桌面端由常驻灵动岛发送；网页端需要浏览器通知权限", group: "alerts", type: "boolean", value: false },
  { key: "alertToasts", label: "应用内提示", hint: "在详细窗口显示告警提示", group: "alerts", type: "boolean", value: true },
  { key: "alertSound", label: "通知提示音", hint: "使用系统内置音效；网页端需先与页面交互", group: "alerts", type: "boolean", value: false },
  { key: "alertSoundName", label: "提示音类型", group: "alerts", options: { subtle: "轻柔", chime: "清脆", urgent: "紧急" }, value: "chime" },
  { key: "alertSoundQuality", label: "模型核验提示音", group: "alerts", options: { off: "关闭", subtle: "轻柔", chime: "清脆", urgent: "紧急" }, value: "chime" },
  { key: "alertSoundTtft", label: "TTFT 提示音", group: "alerts", options: { off: "关闭", subtle: "轻柔", chime: "清脆", urgent: "紧急" }, value: "urgent" },
  { key: "alertSoundCache", label: "Cache 提示音", group: "alerts", options: { off: "关闭", subtle: "轻柔", chime: "清脆", urgent: "紧急" }, value: "subtle" },
  { key: "alertSoundRequest", label: "请求失败提示音", group: "alerts", options: { off: "关闭", subtle: "轻柔", chime: "清脆", urgent: "紧急" }, value: "urgent" },
  { key: "alertSoundBalance", label: "余额提示音", group: "alerts", options: { off: "关闭", subtle: "轻柔", chime: "清脆", urgent: "紧急" }, value: "urgent" },
  { key: "alertVolume", label: "提示音音量", hint: "浏览器和 macOS 使用此音量；Windows 跟随系统音量", group: "alerts", min: 0, max: 100, unit: "%", value: 65 },
  { key: "alertQuality", label: "模型核验偏离", group: "alerts", type: "boolean", value: true },
  { key: "alertTtft", label: "TTFT 超过阈值", group: "alerts", type: "boolean", value: true },
  { key: "alertCache", label: "Cache 低于阈值", group: "alerts", type: "boolean", value: true },
  { key: "alertRequest", label: "请求失败", group: "alerts", type: "boolean", value: true },
  { key: "balanceAlertThreshold", label: "余额告警阈值", hint: "余额比例低于此值时提醒；设为 0 关闭余额告警", group: "thresholds", min: 0, max: 100, unit: "%", value: 20 },
  { key: "balanceAppAlerts", label: "余额应用内通知", group: "interaction", type: "boolean", value: true },
  { key: "balanceSystemAlerts", label: "余额系统通知", group: "interaction", type: "boolean", value: false },
  { key: "reducedMotion", label: "减少动态效果", group: "interaction", type: "boolean", value: false },
  { key: "probeStrategy", label: "核验调度策略", hint: "自适应：工作中低频串行，空闲时加速；仅空闲：打开的待命会话也会核验", group: "verification", options: { adaptive: "自适应 · 边工作边测", idle: "仅空闲时检测", manual: "只手动检测" }, value: "adaptive" },
  { key: "hlwySource", label: "HLWY 基准来源", hint: "没有可信 API 配置时自动回退公共分布；可信 API 仅用于你明确授权的渠道。", group: "verification", options: { public: "公共分布（默认）", trustedApi: "可信 API 对照" }, value: "public" },
  { key: "juiceMode", label: "Juice 检测方式", hint: "原始观测只请求 1 次并保留模型回答；校准对照需同模型、协议和推理档位的参考范围，最多尝试 3 次。", group: "verification", options: { raw: "单次原始观测 · 无需校准", calibrated: "可信校准对照" }, value: "raw" },
  { key: "workingProbeDelaySeconds", label: "工作中请求间隔", hint: "同渠道、同 Key 有 Agent 工作时，两次请求的最短间隔；每轮频率由自动核验轮次间隔控制", group: "verification", min: 5, max: 3600, unit: "秒", value: 20 },
  { key: "probeCooldownSeconds", label: "限流或服务故障冷却", hint: "仅在请求失败后等待；上游要求更久时遵循上游。等待不算请求，不改变每轮核验间隔", group: "verification", min: 15, max: 900, unit: "秒", value: 60 },
  { key: "questionTimeoutSeconds", label: "单问题请求超时", hint: "设为 0 表示不限制时间；仍可手动暂停或终止请求", group: "verification", min: 0, max: 3600, unit: "秒", value: 300 },
  { key: "questionMaxOutputTokens", label: "单问题输出预算", hint: "包含提供方计入输出预算的推理 token；实际费用取决于实际用量", group: "verification", min: 512, max: 65536, unit: "token", value: 16384 },
  { key: "astraSamples", label: "Astra 每组次数", hint: "5 组探针；默认共 5 次预览，原帖每组 10 次共 50 次", group: "verification", min: 1, max: 100, unit: "次", value: 1 },
  { key: "oneTokenSamples", label: "One Token 每题次数", hint: "10 类英文任务；默认共 10 次请求，每题至少 10 次有效回答才计算参考 JSD", group: "verification", min: 1, max: 100, unit: "次", value: 1 },
  { key: "kbfTier", label: "KBF 核验规模", group: "verification", options: { screen: "试采 · 1 批，最多 10 题", full: "完整参考集 · 按模型显示请求数" }, value: "screen" },
  { key: "kbfReferenceModel", label: "KBF 参考模型", hint: "当前模型未覆盖时，可明确选择要比较的历史参考模型", group: "verification", options: {"current": "当前申报模型", "anthropic/claude-opus-4.6": "anthropic/claude-opus-4.6", "anthropic/claude-sonnet-4.6": "anthropic/claude-sonnet-4.6", "deepseek/deepseek-v3.2": "deepseek/deepseek-v3.2", "google/gemini-2.5-flash-lite": "google/gemini-2.5-flash-lite", "google/gemini-3-flash-preview": "google/gemini-3-flash-preview", "z-ai/glm-4.7-flash": "z-ai/glm-4.7-flash", "z-ai/glm-4.7": "z-ai/glm-4.7", "z-ai/glm-5": "z-ai/glm-5", "openai/gpt-4.1-mini": "openai/gpt-4.1-mini", "openai/gpt-4.1-nano": "openai/gpt-4.1-nano", "openai/gpt-5.4": "openai/gpt-5.4", "moonshotai/kimi-k2-0905": "moonshotai/kimi-k2-0905", "meta-llama/llama-4-scout": "meta-llama/llama-4-scout", "qwen/qwen3.5-27b": "qwen/qwen3.5-27b", "qwen/qwen3.5-397b-a17b": "qwen/qwen3.5-397b-a17b", "qwen/qwen3.5-9b": "qwen/qwen3.5-9b"}, value: "current" },
  { key: "idleGraceSeconds", label: "工作结束后的让行时间", group: "verification", min: 0, max: 60, unit: "秒", value: 3 },
  ...[
    ["focusOpacity", "专注背景不透明度", 94, 0], ["popoverOpacity", "扩展详情不透明度", 98, 0],
    ["panelOpacity", "详细窗口面板不透明度", 94, 0], ["compactBackingOpacity", "极简图标底色不透明度", 88, 0],
    ["compactRingOpacity", "极简空环不透明度", 72, 0]
  ].map(([key, label, value, min]) => ({ key, label, group: "appearance", min, max: 100, unit: "%", value })),
  { key: "islandCenterIcon", label: "灵动岛环中心图标", hint: "极简与普通形态使用模型或对应 Agent 图标；多个 Agent 并列显示，超过四种显示数量。专注形态保持指标图标。", group: "display", options: { model: "四元组对应的模型", agents: "四元组对应的 Agent" }, value: "model" },
  { key: "fundsDisplay", label: "余额 / 余量显示", hint: "自动按渠道选择：官方 OAuth 与 CPA 显示订阅余量，其他渠道显示余额；缺失数据不互相替代。", group: "display", options: { auto: "跟随渠道", balance: "渠道余额", quota: "订阅余量" }, value: "auto" },
  { key: "compactMetric", label: "极简形态环指标", group: "display",
    options: { quality: "模型核验", cache: "Cache", ttft: "TTFT", balance: "余额", none: "仅模型图标" }, value: "quality" },
  ...["quality", "cache", "ttft", "balance"].map(metric => ({ key: `normalShow${metric[0].toUpperCase()}${metric.slice(1)}`, label: `普通形态显示${{ quality: "模型核验", cache: "Cache", ttft: "TTFT", balance: "余额" }[metric]}环`, group: "display", type: "boolean", value: metric === "quality" })),
  ...["quality", "cache", "ttft", "balance"].map(metric => ({ key: `overviewShow${metric[0].toUpperCase()}${metric.slice(1)}`, label: `标准界面显示${{ quality: "模型核验", cache: "Cache", ttft: "TTFT", balance: "余额" }[metric]}环`, group: "display", type: "boolean", value: metric !== "balance" })),
  { key: "islandColorMode", label: "灵动岛环配色", hint: "阈值配色使用下方各指标的低、中、高值颜色；缺失数值不视为零", group: "thresholds", options: { metric: "固定指标色", threshold: "按指标阈值变色" }, value: "metric" },
  { key: "ringStyle", label: "三环显示样式", hint: "深浅同色：深色表示范围最大值，浅色表示当前值；经典样式保留原有轨道", group: "display", options: { classic: "经典渐变环", depth: "深浅同色范围环" }, value: "classic" },
  { key: "bridgeStyle", label: "连接线动态风格", hint: "悬浮详情与灵动岛之间的连接线", group: "display", options: { ribbon: "柔和丝带", flow: "水流", pulse: "呼吸脉冲" }, value: "flow" },
  ...["focus", "detail", "popover"].flatMap(surface => ["quality", "cache", "ttft", ...(surface === "focus" ? ["balance"] : [])].map(metric => ({
    key: `${surface}Show${metric[0].toUpperCase()}${metric.slice(1)}`, group: "display", type: "boolean", value: surface === "focus" && metric === "balance" ? false : true,
    label: `${{ focus: "专注", detail: "详细窗口", popover: "扩展详情" }[surface]}显示${{ quality: "模型核验", cache: "Cache", ttft: "TTFT", balance: "余额 / 余量" }[metric]}` }))),
  ...["Endpoint", "KeyGroup", "Reasoning", "Agents"].map(info => ({ key: `show${info}`, group: "display", type: "boolean", value: true,
    label: `扩展详情显示${{ Endpoint: "渠道", KeyGroup: "Key 分组", Reasoning: "推理档位", Agents: "Agent 状态" }[info]}` })),
  ...["quality", "cache", "ttft"].flatMap(metric => [
    { key: `${metric}WarningScore`, label: `${metric.toUpperCase()} 警戒分界`, min: 0, max: 99, value: 55, unit: "%" },
    { key: `${metric}GoodScore`, label: `${metric.toUpperCase()} 良好分界`, min: 1, max: 100, value: 90, unit: "%" },
    { key: `${metric}LowColor`, label: `${metric.toUpperCase()} 低值颜色`, type: "color", value: "#ff7185" },
    { key: `${metric}MiddleColor`, label: `${metric.toUpperCase()} 中值颜色`, type: "color", value: "#f3c969" },
    { key: `${metric}HighColor`, label: `${metric.toUpperCase()} 高值颜色`, type: "color", value: "#20d6b5" }
  ].map(field => ({ ...field, group: "thresholds", hint: metric === "ttft" ? "按 TTFT 相对告警阈值的健康分计算，分数越高越快" : "显示配色分界，不改变核验结论" })))
];

export const preferenceDefaults = Object.fromEntries(preferenceFields.map(field => [field.key, field.value]));

export function validatePreference(key, value) {
  const field = preferenceFields.find(field => field.key === key);
  if (!field) return false;
  const valid = field.options ? Object.hasOwn(field.options, value) : field.type === "boolean" ? typeof value === "boolean"
    : field.type === "color" ? typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    : Number.isSafeInteger(value) && value >= field.min && value <= field.max;
  if (!valid) throw new TypeError(`${field.label}超出有效范围`);
  return true;
}
