import { completeJson, stopGenerating } from '../ai/local';
import { getModelId } from '../ai';
import {
  ASSIGN_SYSTEM, assignMessage, assignSchema, combine, InvalidProposal, OrganizeBubble, parseProposal, parseTopics,
  Proposal, TOPICS_SYSTEM, topicsMessage, topicsSchema,
} from './prompt';

// Asks the on-device model to group a web's bubbles, in two calls (see
// prompt.ts). Always on device (it works offline once a model is
// downloaded), even when the Add tab is set to the cloud server.

let stopped = false;
export async function stopOrganizing() {
  stopped = true;
  await stopGenerating();
}

export class Stopped extends Error {}

export async function proposeGroups(subject: string, bubbles: OrganizeBubble[], onStatus: (s: string) => void): Promise<Proposal> {
  stopped = false;
  const call = async (args: Omit<Parameters<typeof completeJson>[0], 'modelId' | 'onStatus'>) => {
    try {
      const raw = await completeJson({ ...args, modelId: getModelId(), onStatus });
      if (stopped) throw new Stopped('Stopped.');
      return raw;
    } catch (e: any) {
      if (stopped) throw new Stopped('Stopped.');
      throw e;
    }
  };

  const topicsRaw = await call({
    system: TOPICS_SYSTEM, user: topicsMessage(subject, bubbles), schema: topicsSchema, maxTokens: 500,
    progress: n => 'Step 1 of 2: finding topics\u2026 ' + n + ' tokens',
  });
  const topics = parseTopics(topicsRaw);
  onStatus('Step 2 of 2: sorting ' + bubbles.length + ' bubbles into ' + topics.length + ' topics\u2026');
  const assignRaw = await call({
    system: ASSIGN_SYSTEM, user: assignMessage(subject, bubbles, topics), schema: assignSchema(bubbles, topics),
    maxTokens: 120 + bubbles.length * 30,
    progress: n => 'Step 2 of 2: sorting ' + bubbles.length + ' bubbles\u2026 ' + n + ' tokens',
  });
  return parseProposal(combine(topics, assignRaw), bubbles);
}

export { InvalidProposal };
