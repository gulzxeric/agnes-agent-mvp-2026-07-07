# 从 Sequential Chain 升级为 ReAct Agent

当前代码是写死的 Sequential Chain（文本 → 图片），本文档教你一步步改造成真正的 Agent：**LLM 自己思考、自己选工具、自己决定何时完成**。

---

## 一、什么是 ReAct

ReAct = **Rea**soning + **Act**ion

每轮循环 LLM 输出三样东西：

```
Thought:  我在想什么，为什么走这一步
Action:   我要调用哪个工具
Action Input: 传给工具的参数
```

执行工具后，把结果拼成 `Observation:` 塞回对话，LLM 继续思考，直到它输出 `Final Answer:`。

```
User: 帮我们4个人策划一个活动，预算30，天气晴朗
       │
       ▼
Thought: 需要先了解用户的具体情况
Action:  generate_activity_plan
Action Input: { "memberCount": 4, "weather": "晴朗", "budget": 30, "mood": "热情" }
       │
       ▼  (返回结果)
       │
Thought: 方案有了，再生成一张海报
Action:  generate_poster
Action Input: { "prompt": "..." }
       │
       ▼  (返回图片 URL)
       │
Thought: 方案和海报都准备好了
Final Answer: 你们的校园活动是xxx，海报在这里xxx
```

---

## 二、整体架构

```
┌──────────────────────────────────────┐
│            ReAct Loop                 │
│                                      │
│  ┌──────────┐    ┌───────────────┐   │
│  │  LLM     │◄───│  对话历史      │   │
│  │ (agnes-  │    │ (messages[])   │   │
│  │ 2.0-     │    └───────────────┘   │
│  │ flash)   │         │              │
│  └────┬─────┘         │ append       │
│       │               │              │
│       ▼               │              │
│  ┌──────────┐         │              │
│  │ parse    │         │              │
│  │ Action   │────────►│              │
│  │ or Final │         │              │
│  └────┬─────┘         │              │
│       │               │              │
│  ┌────▼─────┐         │              │
│  │ Tool     │─────────►              │
│  │ Executor │ 结果 as                │
│  │          │ Observation            │
│  └──────────┘                        │
└──────────────────────────────────────┘
```

---

## 三、工具定义

每个工具是一个对象：

| 字段 | 说明 |
|------|------|
| `name` | 工具名，LLM 用这个名字引用 |
| `description` | 描述，**LLM 靠这个决定是否选它** |
| `parameters` | JSON Schema，LLM 按这个格式传参 |
| `handler` | 实际的 async 函数 |

### 示例工具清单

```javascript
const tools = [
  {
    name: 'generate_activity_plan',
    description: '根据人数、天气、预算、氛围，策划一个校园活动方案，返回活动名称、推理、规则、惩罚',
    parameters: {
      type: 'object',
      properties: {
        memberCount:  { type: 'number', description: '参与人数' },
        weather:      { type: 'string', description: '天气状况' },
        budget:       { type: 'number', description: '每人预算（元）' },
        mood:         { type: 'string', description: '当前氛围心情' }
      },
      required: ['memberCount', 'weather', 'budget', 'mood']
    },
    handler: async (args) => {
      // 调用 agnes-2.0-flash，返回活动方案 JSON
      return { activityName, reasoning, rules, punishment };
    }
  },
  {
    name: 'generate_poster',
    description: '根据一段英文 Prompt 生成活动海报图片，返回图片 URL',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '英文图片描述 Prompt' },
        size:   { type: 'string', enum: ['1024x1024', '512x512'], description: '图片尺寸' }
      },
      required: ['prompt']
    },
    handler: async (args) => {
      // 调用 agnes-image-2.1-flash，返回 posterUrl
      return { posterUrl };
    }
  }
];
```

### 工具设计原则

1. **name 要简短**，LLM 容易记住
2. **description 要清晰**，LLM 靠文字理解决定选哪个
3. **parameters 用 JSON Schema**，LLM 支持原生生成
4. **handler 返回结构化数据**，不要只返回字符串

---

## 四、ReAct 提示词

这是整个 Agent 的"大脑"。通过 System Prompt 教会 LLM 如何思考。

```
你是一个活动策划 Agent。你有以下工具可用：

{tools_json}

你必须严格按照以下格式思考和输出，每轮只输出一个步骤：

Thought: 思考当前情况，分析下一步需要做什么
Action: 工具名称（必须是上面列表中的某一个）
Action Input: {"参数名": "参数值"}

当你收到工具返回的结果后，继续输出：

Thought: 分析工具返回的结果，决定下一步
Action: ...

当你认为任务完全可以完成时，输出：

Final Answer: 最终的完整回复（直接回复用户的内容）
```

### 关键要点

- LLM **一次只输出一个 Action**，不能一次调用多个工具
- 用 `Observation:` 前缀把工具结果塞回对话
- 限制最大循环次数（如 10 次），防止无限循环
- 支持 LLM 说"这个任务我做不到"

---

## 五、ReAct 循环核心代码

```javascript
async function runReActLoop(userInput, tools, maxIterations = 10) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(tools) },
    { role: 'user', content: userInput }
  ];

  for (let i = 0; i < maxIterations; i++) {
    // 1. 调用 LLM
    const response = await callLLM(messages);
    const output = response.choices[0].message.content.trim();
    messages.push({ role: 'assistant', content: output });

    // 2. 判断是 Final Answer 还是 Action
    if (output.includes('Final Answer:')) {
      return extractFinalAnswer(output);
    }

    // 3. 解析 Action
    const action = parseAction(output);
    if (!action) {
      throw new Error('LLM 输出格式无法解析');
    }

    // 4. 查找并执行工具
    const tool = tools.find(t => t.name === action.name);
    if (!tool) {
      throw new Error(`未知工具: ${action.name}`);
    }

    const result = await tool.handler(action.input);

    // 5. 把工具结果作为 Observation 塞回对话
    messages.push({
      role: 'user',
      content: `Observation: ${JSON.stringify(result)}`
    });
  }

  throw new Error('达到最大迭代次数，任务未完成');
}
```

### 解析 Action 的函数

```javascript
function parseAction(text) {
  // 匹配格式：
  // Action: tool_name
  // Action Input: {"key": "value"}
  const actionMatch = text.match(/Action:\s*(.+)/);
  const inputMatch = text.match(/Action Input:\s*(\{[\s\S]*\})/);

  if (!actionMatch || !inputMatch) return null;

  return {
    name: actionMatch[1].trim(),
    input: JSON.parse(inputMatch[1])
  };
}
```

---

## 六、错误处理策略

| 场景 | 处理方式 |
|------|----------|
| LLM 输出了格式错误的 Action | 返回 Observation 告知格式错误，让它重试 |
| 工具执行抛异常 | 把异常信息作为 Observation 返回，让 LLM 决定是重试还是换方案 |
| 连续格式错误超过 3 次 | 终止循环，返回错误给用户 |
| 达到最大循环次数 | 终止，返回"已达到最大步骤限制" |
| LLM 输出 Final Answer 但其实是胡扯 | 由下游判断，至少 Agent 表面上是完成了 |

---

## 七、完整流程示例

```
User: 我们4个人，天气晴朗，预算30块每人，大家都很嗨

────────────────────── 第 1 轮 ──────────────────────

LLM:
Thought: 用户提供了完整信息，我需要先生成一个活动方案
Action: generate_activity_plan
Action Input: {"memberCount": 4, "weather": "晴朗", "budget": 30, "mood": "热情高涨"}

代码执行工具 → 返回:
{"activityName": "操场水枪大作战", "reasoning": "...", "rules": ["..."], "punishment": "..."}

追加 Observation → 继续

────────────────────── 第 2 轮 ──────────────────────

LLM:
Thought: 方案已经有了，现在需要生成一张海报
Action: generate_poster
Action Input: {"prompt": "College students playing with water guns...", "size": "1024x1024"}

代码执行工具 → 返回:
{"posterUrl": "https://xxx.com/poster.png"}

追加 Observation → 继续

────────────────────── 第 3 轮 ──────────────────────

LLM:
Thought: 活动方案和海报都准备好了，可以回复用户
Final Answer: 你们的校园活动是【操场水枪大作战】！以下是活动详情：
- 规则：xxx
- 惩罚：xxx
- 海报：![海报](https://xxx.com/poster.png)
```

---

## 八、改造路线图

### Step 1：重构工具
把 `routers/plan.js` 里的两个模型调用拆成独立的工具函数。
→ 产出：`tools/generate_activity_plan.js` + `tools/generate_poster.js`

### Step 2：实现 ReAct 引擎
写 `lib/react-loop.js`，包含：
- `buildSystemPrompt(tools)` — 生成 ReAct 提示词
- `parseAction(text)` — 解析 LLM 输出
- `runReActLoop(userInput, tools)` — 循环主逻辑

### Step 3：改造路由
`POST /api/plan` 从直接调链改成调用 `runReActLoop`。

### Step 4：前端适配
前端基本不用动，返回格式可以保持一致。

---

## 九、工程结构（改造后）

```
agent-mvp/
├── app.js                    # 入口（不变）
├── routers/
│   └── plan.js               # 路由（改造：调用 runReActLoop）
├── lib/
│   ├── react-loop.js          # ReAct 循环引擎（新增）
│   ├── fetch-with-retry.js    # 原 fetchWithRetry 抽出来复用（新增）
│   └── parse-json.js          # 原 parseJSONStrict 抽出来复用（新增）
├── tools/
│   ├── generate_activity_plan.js  # 工具1（新增）
│   └── generate_poster.js         # 工具2（新增）
├── public/
│   └── index.html             # 前端（小改）
├── .env
└── package.json
```

---

## 十、总结

| 对比 | 当前代码 | ReAct Agent |
|------|---------|-------------|
| 流程 | 开发者写死 | LLM 自己决策 |
| 工具调用 | 直接调用 | 通过 LLM 输出 Action 间接调用 |
| 循环 | 固定 2 步 | 动态多步，直到 LLM 说完成了 |
| 可扩展性 | 加逻辑要改代码 | 加工具注册就行 |
| 容错 | fail fast | LLM 可以重试、换工具、调整参数 |

**一句话：** 现在是人写剧本，之后是 LLM 自己即兴表演。
