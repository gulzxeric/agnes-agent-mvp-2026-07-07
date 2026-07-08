import { Router } from 'express';
import { generateActivityPlan } from '../tools/generate_activity_plan.js';
import { generatePoster } from '../tools/generate_poster.js';
import { runReActLoop } from '../lib/react-loop.js';
import { tools } from '../tools/index.js';

const router = Router();

// Sequential Chain（原有，保持不变）
router.post('/api/plan', async (req, res) => {
  try {
    const { memberCount, weather, budget, mood } = req.body;

    if (!memberCount || !weather || budget === undefined || !mood) {
      return res.status(400).json({
        success: false,
        error: 'Required inputs (memberCount, weather, budget, mood) are missing.'
      });
    }

    const plan = await generateActivityPlan({ memberCount, weather, budget, mood });
    const prompt = plan.imagePrompt || 'A vibrant graphic poster for a crazy student college activity';
    const { posterUrl } = await generatePoster({ prompt });

    return res.status(200).json({
      success: true,
      data: {
        activityName: plan.activityName,
        reasoning: plan.reasoning,
        rules: plan.rules,
        punishment: plan.punishment,
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

// ReAct Agent（新增）
router.post('/api/agent', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Required input "prompt" is missing.'
      });
    }

    const answer = await runReActLoop(prompt, tools);

    return res.status(200).json({
      success: true,
      data: {
        answer: answer
      }
    });
  } catch (error) {
    console.error('ReAct Agent failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Agent failed to process the request.',
      details: error.message
    });
  }
});

export default router;
