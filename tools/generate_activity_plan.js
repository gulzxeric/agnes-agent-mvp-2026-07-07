import { fetchWithRetry } from '../lib/fetch-with-retry.js';
import { parseJSONStrict } from '../lib/parse-json.js';

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_BASE_URL = 'https://apihub.agnes-ai.com/v1';

export async function generateActivityPlan({ memberCount, weather, budget, mood }) {
  const chatPayload = {
    model: 'agnes-2.0-flash',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a creative student activity planner. You must output a JSON object matching this schema:
{
  "activity_name": "string",
  "reasoning": "string",
  "rules": ["string"],
  "punishment": "string",
  "image_prompt": "string"
}
Do not wrap JSON in markdown code blocks like \\\`\\\`\\\`json. Return raw JSON strictly.`
      },
      {
        role: 'user',
        content: `输入条件如下：
- 参与人数：${memberCount} 人
- 天气状况：${weather}
- 可用预算：${budget} 元
- 氛围评价：${mood}
基于以上条件，发挥你的创意，策划一个大家想玩的校园活动。`
      }
    ],
    temperature: 0.85
  };

  const textResponse = await fetchWithRetry(
    `${AGNES_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AGNES_API_KEY}`
      },
      body: JSON.stringify(chatPayload)
    }
  );

  if (!textResponse.ok) {
    const errorText = await textResponse.text();
    throw new Error(`Upstream Text API error (${textResponse.status}): ${errorText}`);
  }

  const textData = await textResponse.json();
  const rawContent = textData.choices[0].message.content.trim();
  const parsed = parseJSONStrict(rawContent);

  return {
    activityName: parsed.activity_name,
    reasoning: parsed.reasoning,
    rules: parsed.rules,
    punishment: parsed.punishment,
    imagePrompt: parsed.image_prompt
  };
}
