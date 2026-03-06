import { cronJobs, makeFunctionReference } from 'convex/server';

const crons = cronJobs();
const pruneAiHistoryRef = makeFunctionReference<'internalMutation'>('aiHistory:pruneExpired');

crons.interval('prune ai history', { hours: 1 }, pruneAiHistoryRef);

export default crons;
