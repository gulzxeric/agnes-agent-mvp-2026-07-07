import { Router } from 'express';
import { jsonrepair } from 'jsonrepair';

const router = Router();

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_BASE_URL = 'https://apihub.agnes-ai.com/v1';

if (!AGNES_API_KEY) {
  console.error('CRITICAL WARNING: AGNES_API_KEY is not defined in environment variables.');
}

async function fetchWithRetry(url, options, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
        if (attempt === maxRetries - 1) return response;
        const delay = Math.min(8000, Math.pow(2, attempt) * baseDelay) + (Math.random() * 300);
        console.warn(`HTTP ${response.status}. Backing off ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const delay = Math.pow(2, attempt) * baseDelay + (Math.random() * 300);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function parseJSONStrict(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {}
  try {
    return JSON.parse(jsonrepair(raw));
  } catch (_) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]);
  }
  throw new Error('Fatal: No parseable JSON found in LLM output.');
}

router.post('/api/plan', async (req, res) => {
  try {
    const { memberCount, weather, budget, mood } = req.body;
    console.log(req.body,1111)

    if (!memberCount || !weather || budget === undefined || !mood) {
      return res.status(400).json({
        success: false,
        error: 'Required inputs (memberCount, weather, budget, mood) are missing.'
      });
    }

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
      temperature: 1.5
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

    const parsedData = parseJSONStrict(rawContent);
    const extractedPrompt = parsedData.image_prompt || 'A vibrant graphic poster for a crazy student college activity';

    const imagePayload = {
      model: 'agnes-image-2.1-flash',
      prompt: extractedPrompt,
      n: 1,
      size: '1024x1024'
    };

    const imageResponse = await fetchWithRetry(
      `${AGNES_BASE_URL}/images/generations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGNES_API_KEY}`
        },
        body: JSON.stringify(imagePayload)
      }
    );

    let posterUrl = '';
    if (imageResponse.ok) {
      const imageData = await imageResponse.json();
      posterUrl = imageData.data[0].url || '';
    } else {
      const imageErrText = await imageResponse.text();
      console.error(`Image API failed (${imageResponse.status}): ${imageErrText}`);
      posterUrl = 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1024&q=80';
    }

    return res.status(200).json({
      success: true,
      data: {
        activityName: parsedData.activity_name,
        reasoning: parsedData.reasoning,
        rules: parsedData.rules,
        punishment: parsedData.punishment,
        posterUrl: posterUrl
      }
    });
  } catch (error) {
    console.error('Sequential Chain failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Orchestrator failed to process the request.',
      details: error.message
    });
  }
});

export default router;
