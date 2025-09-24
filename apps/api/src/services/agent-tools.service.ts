import { Injectable } from '@nestjs/common';
import leadIntakeTools from '../../agents/lead-intake-agent/tools';
import fastCasualRagTools from '../../agents/fast-casual-rag/tools';
import { tool } from '@langchain/core/tools';
type BoundTool = ReturnType<typeof tool>;

@Injectable()
export class AgentToolsService {
  async load(agent: string): Promise<BoundTool[]> {
    switch (agent) {
      case 'lead-intake-agent':
        return leadIntakeTools as BoundTool[];
      case 'fast-casual-rag':
        return fastCasualRagTools as BoundTool[];
      default:
        return [];
    }
  }
}


