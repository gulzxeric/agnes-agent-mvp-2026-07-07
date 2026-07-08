import { fetchWithRetry } from './fetch-with-retry.js';

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_BASE_URL = 'https://apihub.agnes-ai.com/v1';

export async function callLLM(messages, options = {}) {
  const payload = {
    model: options.model || 'agnes-2.0-flash',
    messages,
    temperature: options.temperature ?? 0.3,
    ...(options.response_format ? { response_format: options.response_format } : {})
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchWithRetry(
      `${AGNES_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGNES_API_KEY}`
        },
        body: JSON.stringify(payload)
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content.trim();
    }

    const errorText = await response.text();
    if (attempt < maxAttempts && (response.status === 404 || response.status >= 500)) {
      console.warn(`LLM API ${response.status} (attempt ${attempt}/${maxAttempts}). Retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      continue;
    }

    throw new Error(`LLM API error (${response.status}): ${errorText}`);
  }
}
