import { defineTool } from '@deepseek-ai/dsh-tools';
import {
  classify, validateState, transitionCheck,
  evidenceLint, planLint, gatePrecheck,
  releaseAudit, installAudit, resumeCard,
  getCapabilities,
  validateContext, evidenceGraphLint, evidenceFreshness,
  progressDecide, criticalPath, changeImpact,
  gatePlan, gateAggregate, gateReopen, previewMutation,
  exitCheck,
  loopTick,
} from './core/index.js';
import { registerTools } from './tools.js';

export const name = 'tech-lead-tools';
export const inject = ['tools'];
export { getCapabilities };

/**
 * Registers the read-only tech-lead tool surface. Every tool computes over
 * caller-supplied JSON — no filesystem writes, no subprocesses, no network.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  for (const tool of registerTools(defineTool, {
    classify, validateState, transitionCheck,
    evidenceLint, planLint, gatePrecheck,
    releaseAudit, installAudit, resumeCard,
    validateContext, evidenceGraphLint, evidenceFreshness,
    progressDecide, criticalPath, changeImpact,
    gatePlan, gateAggregate, gateReopen, previewMutation,
    exitCheck,
    loopTick,
    getCapabilities,
  })) {
    ctx.tools.register(tool);
  }
}
