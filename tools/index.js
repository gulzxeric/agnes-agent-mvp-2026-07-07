import { generateActivityPlan } from './generate_activity_plan.js';
import { generatePoster } from './generate_poster.js';

export const tools = [
  {
    name: 'generate_activity_plan',
    description: '根据参与人数、天气状况、每人预算和当前氛围心情，策划一个校园活动方案。返回活动名称、策划思路、活动规则和惩罚机制。',
    parameters: {
      type: 'object',
      properties: {
        memberCount: { type: 'number', description: '参与活动的人数' },
        weather: { type: 'string', description: '当天的天气状况描述' },
        budget: { type: 'number', description: '每人可用预算（元）' },
        mood: { type: 'string', description: '当前大家的心情氛围描述' }
      },
      required: ['memberCount', 'weather', 'budget', 'mood']
    },
    handler: generateActivityPlan
  },
  {
    name: 'generate_poster',
    description: '根据一段英文描述 Prompt，生成一张活动海报图片。返回图片的 URL。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '英文图片描述，用于生成海报' },
        size: { type: 'string', enum: ['1024x1024', '512x512'], description: '图片尺寸，默认 1024x1024' }
      },
      required: ['prompt']
    },
    handler: generatePoster
  }
];
