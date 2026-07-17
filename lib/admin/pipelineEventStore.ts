export type PipelineStepKey =
  | "recommendation"
  | "validation"
  | "learning"
  | "weight_optimizer";

export interface PipelineStepEvent {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

const events: Record<PipelineStepKey, PipelineStepEvent> = {
  recommendation: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
  validation: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
  learning: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
  weight_optimizer: { lastSuccessAt: null, lastFailureAt: null, lastError: null },
};

export function recordPipelineSuccess(step: PipelineStepKey, at = new Date().toISOString()): void {
  events[step].lastSuccessAt = at;
  events[step].lastError = null;
}

export function recordPipelineFailure(
  step: PipelineStepKey,
  error: string,
  at = new Date().toISOString()
): void {
  events[step].lastFailureAt = at;
  events[step].lastError = error;
}

export function getPipelineStepEvents(): Record<PipelineStepKey, PipelineStepEvent> {
  return structuredClone(events);
}
