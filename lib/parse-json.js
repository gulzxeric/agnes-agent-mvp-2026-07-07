import { jsonrepair } from 'jsonrepair';

export function parseJSONStrict(raw) {
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
