import type {
  DistillRequest,
  DistillApiResponse,
  LlmActivityReporter,
} from '../../types';
import {
  runDistillOrchestration,
  type DistillOrchestrationDeps,
} from '../../services/distill-orchestration';

export type ProcessDistillDeps = DistillOrchestrationDeps;

export async function processDistill(
  reqData: DistillRequest,
  reportProgress: LlmActivityReporter,
  deps: ProcessDistillDeps = {}
): Promise<DistillApiResponse> {
  return runDistillOrchestration(reqData, reportProgress, deps);
}
