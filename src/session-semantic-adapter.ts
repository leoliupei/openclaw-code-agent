import type { EmbeddedEvalResult } from "./embedded-eval";
import { EmbeddedEvalService } from "./embedded-eval";

export interface DeliverableClassificationContext {
  harnessName?: string;
  sessionName: string;
  prompt: string;
  workdir: string;
  agentId?: string;
  outputText: string;
}

export class SessionSemanticAdapter {
  constructor(private readonly evaluator: EmbeddedEvalService = new EmbeddedEvalService()) {}

  async classifyNoChangeDeliverable(context: DeliverableClassificationContext): Promise<EmbeddedEvalResult> {
    return this.classifyDeliverable(context);
  }

  private async classifyDeliverable(context: DeliverableClassificationContext): Promise<EmbeddedEvalResult> {
    return this.evaluator.classify({
      task: "report_worthy_no_change",
      workspaceDir: context.workdir,
      agentId: context.agentId,
      prompt: context.prompt,
      sessionName: context.sessionName,
      turnText: context.outputText,
    });
  }
}
