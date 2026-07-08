import { callLLM } from './call-llm.js';

function buildSystemPrompt(tools) {
  const toolsJson = JSON.stringify(tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  })), null, 2);

  return `你是一个活动策划 Agent。你有以下工具可用：

${toolsJson}

你必须严格按照以下格式思考和输出，每轮只输出一个步骤：

Thought: 思考当前情况，分析下一步需要做什么
Action: 工具名称（必须是上面列表中的某一个）
Action Input: {"参数名": "参数值"}

当你收到工具返回的结果后，继续输出：

Thought: 分析工具返回的结果，决定下一步
Action: ...

当你认为任务完全可以完成，可以给用户最终回复时，输出：

Final Answer: 最终的完整回复

注意：
- 每轮只能调用一个工具
- 工具名称必须严格匹配列表中的 name
- Action Input 必须是合法的 JSON 对象
- 不要自己编造结果，必须通过工具获取真实数据`;
}

function parseAction(text) {
  const thoughtMatch = text.match(/Thought:\s*(.+?)(?=\nAction:|\nFinal Answer:|$)/s);
  const actionMatch = text.match(/Action:\s*(.+)/);
  const inputMatch = text.match(/Action Input:\s*(\{[\s\S]*?\})/);
  const finalMatch = text.match(/Final Answer:\s*(.+)/s);

  if (finalMatch) {
    return { type: 'final', thought: thoughtMatch?.[1]?.trim(), answer: finalMatch[1].trim() };
  }

  if (actionMatch && inputMatch) {
    let input;
    try {
      input = JSON.parse(inputMatch[1]);
    } catch {
      return null;
    }
    return {
      type: 'action',
      thought: thoughtMatch?.[1]?.trim(),
      name: actionMatch[1].trim(),
      input
    };
  }

  return null;
}

export async function runReActLoop(userInput, tools, maxIterations = 10) {
  const systemPrompt = buildSystemPrompt(tools);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput }
  ];

  for (let i = 0; i < maxIterations; i++) {
    console.log(`\n--- ReAct Loop Iteration ${i + 1} ---`);

    const output = await callLLM(messages, { temperature: 0.3 });
    messages.push({ role: 'assistant', content: output });

    console.log(`LLM output:\n${output}\n`);
    console.log('第几轮循环？',maxIterations)

    const parsed = parseAction(output);
    if (!parsed) {
      messages.push({
        role: 'user',
        content: 'Observation: 格式错误。请严格按照 Thought / Action / Action Input 或 Final Answer 格式输出。'
      });
      continue;
    }

    if (parsed.type === 'final') {
      console.log('Agent reached final answer.');
      return parsed.answer;
    }

    const tool = tools.find(t => t.name === parsed.name);
    if (!tool) {
      messages.push({
        role: 'user',
        content: `Observation: 未知工具 "${parsed.name}"。可用的工具：${tools.map(t => t.name).join(', ')}`
      });
      continue;
    }

    try {
      console.log(`Executing tool: ${parsed.name} with args:`, parsed.input);
      const result = await tool.handler(parsed.input);
      const observation = `Observation: ${JSON.stringify(result)}`;
      console.log(observation);
      messages.push({ role: 'user', content: observation });
    } catch (err) {
      console.error(`Tool ${parsed.name} failed:`, err.message);
      messages.push({
        role: 'user',
        content: `Observation: 工具执行出错 - ${err.message}`
      });
    }
  }

  throw new Error(`Agent reached max iterations (${maxIterations}) without final answer.`);
}
