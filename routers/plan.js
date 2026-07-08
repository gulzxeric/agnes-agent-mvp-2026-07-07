import { Router } from 'express';
import { generateActivityPlan } from '../tools/generate_activity_plan.js';
import { generatePoster } from '../tools/generate_poster.js';

const router = Router();

router.post('/api/plan', async (req, res) => {
  try {
    const { memberCount, weather, budget, mood } = req.body;

    if (!memberCount || !weather || budget === undefined || !mood) {
      return res.status(400).json({
        success: false,
        error: 'Required inputs (memberCount, weather, budget, mood) are missing.'
      });
    }

    // Step 1: 生成活动方案
    const plan = await generateActivityPlan({ memberCount, weather, budget, mood });

    // Step 2: 生成海报
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

export default router;
