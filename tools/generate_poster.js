import { fetchWithRetry } from '../lib/fetch-with-retry.js';

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_BASE_URL = 'https://apihub.agnes-ai.com/v1';

const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1024&q=80';

export async function generatePoster({ prompt, size = '1024x1024' }) {
  const imagePayload = {
    model: 'agnes-image-2.1-flash',
    prompt: prompt,
    n: 1,
    size: size
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

  if (imageResponse.ok) {
    const imageData = await imageResponse.json();
    const posterUrl = imageData.data[0].url || '';
    return { posterUrl };
  }

  const imageErrText = await imageResponse.text();
  console.error(`Image API failed (${imageResponse.status}): ${imageErrText}`);
  return { posterUrl: FALLBACK_POSTER };
}
