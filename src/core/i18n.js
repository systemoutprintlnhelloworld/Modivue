// Source-language keys keep existing Chinese UI copy readable during migration.
const english = {
  "界面语言": "Language", "简体中文": "简体中文", "跟随系统": "System", "英文": "English",
  "模型质量监测": "Model observability", "工作台": "Workspace", "概览": "Overview", "模型": "Models", "路由": "Routes",
  "模型核验": "Verification", "系统": "System", "告警": "Alerts", "日志": "Logs", "设置": "Settings",
  "本地采集服务运行中": "Local collector running", "搜索功能与设置": "Search features and settings",
  "搜索功能或设置 · ⌘K": "Search features or settings · ⌘K", "搜索结果": "Search results", "功能": "Feature",
  "↑ ↓ 选择 · Enter 打开 · Esc 关闭": "↑ ↓ Select · Enter Open · Esc Close", "关闭": "Close", "上一页": "Previous page", "下一页": "Next page",
  "没有匹配的功能或设置": "No matching features or settings", "正在连接": "Connecting", "时间范围": "Time range",
  "最近 1 小时": "Last hour", "最近 6 小时": "Last 6 hours", "最近 24 小时": "Last 24 hours", "最近 7 天": "Last 7 days",
  "全部模型": "All models", "全部渠道": "All endpoints", "全部分组": "All key groups", "全部档位": "All reasoning levels",
  "渠道": "Endpoint", "Key 分组": "Key group", "推理档位": "Reasoning effort", "清除筛选": "Clear filters",
  "活跃模型": "Active models", "今天的模型状态": "Model activity today", "立即采样": "Sample now",
  "按渠道与分组追踪真实调用表现，缺少上游字段时保留原始状态。": "Track real requests by endpoint and key group. Missing provider fields remain unavailable.",
  "正在同步标准模型目录": "Syncing model catalog", "正在探测 coding agent": "Discovering coding agents",
  "实时核心指标": "Live metrics", "当前选中模型 · 等待真实样本": "Selected model · Waiting for samples",
  "本地服务": "Local service", "采集服务正常": "Collector healthy", "无真实样本": "No samples",
  "Cache 命中率": "Cache hit rate", "首字响应 TTFT": "Time to first token", "未评测": "Not tested", "未提供": "Unavailable",
  "等待真实样本": "Waiting for samples", "暂无趋势": "No trend data", "指标趋势": "Metric trends", "总耗时": "Duration",
  "模型对比": "Model comparison", "按当前筛选条件聚合": "Aggregated by current filters", "查看全部 →": "View all →",
  "最近事件": "Recent events", "异常变化与采集日志": "Changes and collection logs", "查看日志 →": "View logs →",
  "暂无事件 · 真实代理调用后将在此显示": "No events yet. Proxied requests will appear here.",
  "监测": "Monitoring", "外观": "Appearance", "交互": "Interaction", "显示内容": "Content", "阈值配色": "Threshold colors",
  "核验": "Verification", "题库": "Questions", "连接": "Connection", "检测策略": "Scheduling",
  "搜索全部设置": "Search all settings", "搜索设置": "Search settings", "详细窗口引导": "Dashboard tour", "灵动岛引导": "Island tour",
  "没有匹配的设置": "No matching settings", "更改会自动保存": "Changes save automatically", "有未保存的更改": "Unsaved changes",
  "正在自动保存…": "Saving…", "所有更改已保存": "All changes saved", "请检查输入范围；更改尚未保存": "Check the input range. Changes are not saved yet.",
  "监测设置": "Monitoring settings", "主动探测": "Active probing", "主动探测间隔": "Probe interval", "探测指令": "Probe prompt",
  "默认时间范围": "Default time range", "浏览器通知": "Browser notifications", "阈值与预算": "Thresholds and budget",
  "TTFT 告警阈值": "TTFT alert threshold", "Cache 告警阈值": "Cache alert threshold", "每日探测上限": "Daily request limit",
  "探测输出上限": "Probe output limit", "连续偏离次数": "Consecutive deviations", "本地代理": "Local proxy",
  "默认核验方案": "Verification method", "Meow 核验强度": "Meow intensity", "HLWY 每轮样本数": "HLWY samples per run",
  "当前测试题目": "Current question", "核验请求间隔": "Verification request delay", "模型核验间隔": "Verification interval",
  "核验方式与采样": "Method and sampling", "选择方案后只显示相关设置。": "Only settings for the selected method are shown.",
  "已开启": "On", "已关闭": "Off", "保存设置": "Save settings", "保存自定义": "Save appearance", "自定义设置已保存": "Preferences saved",
  "界面主题": "Theme", "石墨": "Graphite", "浅色": "Light", "自定义颜色": "Custom colors",
  "主窗口背景": "Window background", "卡片背景": "Card background", "主窗口文字": "Text color", "主窗口强调色": "Accent color",
  "普通形态背景": "Normal background", "专注形态背景": "Focus background", "悬浮详情背景": "Popover background",
  "灵动岛不透明度": "Island opacity", "主窗口卡片圆角": "Card corner radius", "灵动岛轮廓": "Island shape",
  "椭圆胶囊": "Pill", "圆角矩形": "Rounded rectangle", "小圆角": "Small corners", "普通形态最多显示目标": "Visible targets",
  "边界滚动速度": "Edge scroll speed", "形态过渡时长": "Transition duration", "普通到专注停留": "Focus dwell time",
  "离开收起延迟": "Collapse delay", "专注形态显示悬浮详情": "Show focus popover", "减少动态效果": "Reduce motion",
  "核验调度策略": "Scheduling strategy", "自适应 · 边工作边测": "Adaptive · While working", "仅空闲时检测": "Only while idle", "只手动检测": "Manual only",
  "HLWY 基准来源": "HLWY reference source", "公共分布（默认）": "Public distribution (default)", "可信 API 对照": "Trusted API reference",
  "Juice 检测方式": "Juice mode", "单次原始观测 · 无需校准": "Single observation · No calibration", "可信校准对照": "Calibrated reference",
  "工作中请求间隔": "Request delay while working", "限流或服务故障冷却": "Rate limit / failure cooldown", "工作结束后的让行时间": "Delay after a turn",
  "专注背景不透明度": "Focus opacity", "扩展详情不透明度": "Popover opacity", "详细窗口面板不透明度": "Dashboard panel opacity",
  "极简图标底色不透明度": "Compact icon backing opacity", "极简空环不透明度": "Compact empty ring opacity",
  "极简形态环指标": "Compact ring metric", "普通形态环指标": "Normal ring metric", "仅模型图标": "Model icon only",
  "三环显示样式": "Ring style", "经典渐变环": "Classic gradient", "深浅同色范围环": "Tonal range",
  "核验校准档案": "Calibration archive", "可信 API 回答对照": "Trusted API reference", "参考用途": "Reference purpose",
  "短答案分布": "Short answer distribution", "HLWY 数字分布": "HLWY number distribution", "可信 API 地址": "Trusted API URL",
  "模型名称": "Model name", "获取模型列表": "Fetch model list", "API 协议": "API protocol", "温度": "Temperature",
  "正式采样次数": "Reference samples", "每次输出上限": "Output token limit", "短答案提示词": "Short answer prompt",
  "测试连接": "Test connection", "试采样 · 2 次": "Preview · 2 requests", "导入校准": "Import calibration", "未导入校准档案": "No calibration imported",
  "模型、渠道或分组": "Model, endpoint or key group", "采集日志": "Request logs", "导出 JSONL": "Export JSONL",
  "搜索": "Search", "状态": "Status", "全部": "All", "成功": "Success", "失败": "Failed", "时间": "Time",
  "采集来源": "Source", "输入 / 输出 token": "Input / output tokens", "缓存读取 token": "Cached input tokens", "错误": "Error", "无": "None",
  "核验方式": "Verification method", "导出报告": "Export report", "立即核验": "Verify now", "排队核验": "Queue verification",
  "需配置核验条件": "Configure verification", "检测结论": "Result", "有效样本": "Valid samples", "检测时间": "Measured at",
  "方案版本": "Method version", "请求累计耗时": "Request duration", "总花费": "Total cost", "平均单次花费": "Average request cost",
  "采样进度": "Sampling progress", "请求尝试": "Request attempts", "失败 / 重试": "Failures / retries", "待计费": "Price unavailable",
  "原始数据 JSON": "Raw JSON", "参与样本": "Shared samples", "特征命中": "Feature hits", "命中比例": "Hit ratio", "强指向阈值": "Direction threshold",
  "候选模型": "Candidate", "匹配度": "Match", "参考答案": "Expected answer", "实际回答": "Actual answer",
  "待核验": "Not verified", "检测已暂停，等待下次继续": "Paused · Resume later", "核验请求失败": "Verification request failed",
  "原始观测 · 未校准": "Raw observation · Uncalibrated", "未返回有效数值": "No valid number returned", "与基线一致": "Consistent with reference",
  "偏离申报模型基线": "Deviates from reference", "采样已完成 · 未超过强指向阈值": "Sampling complete · Below direction threshold",
  "筛查已完成 · 未设强指向判定线": "Screening complete · No calibrated threshold", "答案匹配": "Answer matches", "答案不匹配": "Answer differs",
  "待人工复核": "Manual review needed", "协议条件不匹配": "Protocol mismatch", "基准未覆盖": "Model not covered", "校准不可用": "Calibration unavailable",
  "Ztest 多探针检测": "Ztest multi-probe verification", "打开 Ztest 检测": "Open Ztest", "报告链接": "Report URL", "或导入报告 JSON": "Or import report JSON",
  "导入并保存报告": "Import and save report", "Ztest 第三方检测报告": "Ztest third-party report", "单问题测试": "Single-question test",
  "跳过": "Skip", "下一步": "Next", "完成": "Done", "打开设置": "Open settings", "打开详细窗口": "Open dashboard", "返回全部 Agent": "Show all agents"
};
for (const [surface, enSurface] of [["专注", "Focus"], ["详细窗口", "Dashboard"], ["扩展详情", "Popover"]]) {
  for (const [metric, enMetric] of [["模型核验", "verification"], ["Cache", "cache"], ["TTFT", "TTFT"]]) english[`${surface}显示${metric}`] = `${enSurface}: show ${enMetric}`;
}
for (const [name, en] of [["渠道", "endpoint"], ["Key 分组", "key group"], ["推理档位", "reasoning effort"], ["Agent 状态", "agent status"]]) english[`扩展详情显示${name}`] = `Popover: show ${en}`;
for (const metric of ["QUALITY", "CACHE", "TTFT"]) for (const [name, en] of [["警戒分界", "warning threshold"], ["良好分界", "healthy threshold"], ["低值颜色", "low color"], ["中值颜色", "middle color"], ["高值颜色", "high color"]]) english[`${metric} ${name}`] = `${metric} ${en}`;

let locale = "zh-CN";
export const currentLocale = () => locale;
export function translate(message) { return locale === "en" && Object.hasOwn(english, message) ? english[message] : message; }
let observer;
const originals = new WeakMap();
const skipped = "script,style,pre,code,textarea,.question-prompt,.question-result,.model-strip,.model-table,.log-detail,.endpoint-grid";

export function setLocale(value) {
  locale = value === "system" ? (navigator.language.startsWith("zh") ? "zh-CN" : "en") : value === "en" ? "en" : "zh-CN";
  document.documentElement.lang = locale;
  if (!observer) {
    observer = new MutationObserver(localize);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder", "aria-label"] });
  }
  localize();
}

// Translate existing text nodes without replacing controls or changing values.
function localize() {
  if (!document.body) return;
  observer?.disconnect();
  const visit = (node, attribute) => {
    const value = attribute ? node.getAttribute(attribute) : node.nodeValue;
    if (!value?.trim()) return;
    let record = originals.get(node);
    if (!record) { record = {}; originals.set(node, record); }
    const key = attribute || "text";
    const source = record[key]?.translated === value ? record[key].source : value;
    const trimmed = source.trim();
    const translated = source.replace(trimmed, translate(trimmed));
    record[key] = { source, translated };
    if (value !== translated) { if (attribute) node.setAttribute(attribute, translated); else node.nodeValue = translated; }
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) if (!walker.currentNode.parentElement?.closest(skipped)) visit(walker.currentNode);
  for (const element of document.querySelectorAll("[title],[placeholder],[aria-label]")) {
    if (!element.closest(skipped)) for (const name of ["title", "placeholder", "aria-label"]) if (element.hasAttribute(name)) visit(element, name);
  }
  observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder", "aria-label"] });
}
