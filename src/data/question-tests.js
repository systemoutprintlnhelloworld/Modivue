export const builtInQuestions = [
  { id: "candy-21", title: "糖果形状保证题", answer: "21", match: "exact", source: "用户提供",
    method: "只能直接回答，不使用搜索、命令或代码；按可触辨形状选择摸取数量。",
    explanation: "可取 9 颗圆形和 12 颗五角星形，共 21 颗。五角星形中必有苹果和桃子两味，圆形中必有苹果或桃子味，因此出现异形配对。不是不区分形状地任意摸 21 颗。",
    prompt: "直接回答问题，不允许使用联网搜索、调用命令、代码文件：在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状(圆形和五角星形，不同的形状靠手感可以分辨)。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖?(同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求)\n苹果味 桃子味 西瓜味\n圆形 7 9 8\n五角星形 7 6 4" },
  { id: "water-cups-8", title: "水杯配对题", answer: "8", match: "review", source: "https://linux.do/t/topic/2797049",
    method: "禁止搜索和代码；给出最坏交换次数及上下界证明，证明由人工复核。",
    explanation: "原帖给出的参考答案为 8。正确数字不能代替证明；原帖用时经验不作为自动身份判断。",
    prompt: "有一个水杯配对游戏。共有 4 种不同颜色的水杯，每种颜色各有两个。将同色的两个水杯分别放在上下两层，因此上下两层各有 4 个水杯。下层 4 个水杯按某个未知顺序排列，挑战者无法看到它们；上层水杯的颜色和位置则完全可见。游戏开始后，挑战者可以反复进行以下操作：\n1. 向裁判询问当前有多少个位置满足上下两个水杯颜色相同。裁判只回答匹配位置的总数，不透露具体是哪些位置；\n2. 根据目前获得的所有信息，挑战者可以选择交换上层任意两个相邻位置的水杯，注意只能是相邻，不能是任意两个。\n当 4 个位置全部匹配时，游戏结束。挑战者应采用何种策略，才能保证对于下层水杯的任意排列都能完成配对？所有能保证成功的策略中，最坏情况所需的交换次数最少是多少？回答时请不要进行联网搜索，也不要写代码来辅助计算(包括思考过程中)。假设答案是 x，你需要给出严格的证明，为什么 x 可行，为什么小于 x 不可行。" }
];

export const verificationReferences = [
  { title: "Astra 社区五组指纹", url: "https://linux.do/t/topic/2861517", status: "待评估", detail: "随机动物、随机鸟、海卫二周期为第一组；随机国家、土卫八周期为辅助组。帖子每题默认 10 次，共 50 次，参考数据覆盖 Astra、Sol、Terra、Luna。尚未获取可验证的原始基准。" },
  { title: "One Token Is Enough", url: "https://arxiv.org/abs/2607.10252", status: "待评估", detail: "2861517 引用的短答案分布指纹方向；需固定提示词与同条件多批次基线。论文尚未独立复核。" },
  { title: "Knowledge Boundary as Fingerprint", url: "https://arxiv.org/abs/2605.29524", status: "待评估", detail: "2861517 引用的知识边界数值指纹方向；需验证周期题答案分布稳定性，不能混用数值单位。论文尚未独立复核。" },
  { title: "gpt56apidetector", url: "https://github.com/chen-006/gpt56apidetector", status: "待评估", detail: "2861517 引用的上游；待检查许可、协议、评分条件与可复现性。" },
  { title: "Juice 社区方案 2555348", url: "https://linux.do/t/topic/2555348", status: "待补资料", detail: "2026-09-13 公开访问返回页面不存在或私有；暂未取得方法正文。现有 Juice 单次观测与可信校准对照仍可独立使用。" },
  { title: "Juice 社区方案 24576294", url: "https://linux.do/t/topic/24576294", status: "待补资料", detail: "2026-09-13 公开访问返回页面不存在或私有；待取得原始提示词、条件和判定依据后评估接入。" }
];

export function validateQuestion(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("题目必须为对象");
  const question = {};
  for (const [key, max] of [["title", 120], ["prompt", 8000], ["answer", 2000]]) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > max) throw new TypeError(`${key} 需要 1-${max} 个字符`);
    question[key] = input[key].trim();
  }
  if (!["exact", "review"].includes(input.match)) throw new TypeError("请选择完整答案比对或人工复核");
  return { ...question, match: input.match };
}
