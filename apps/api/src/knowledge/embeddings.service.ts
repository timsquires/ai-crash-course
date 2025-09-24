import { Injectable } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';

@Injectable()
export class EmbeddingsService {
  private getModel() {
    return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const model = this.getModel();
    const embedder = new OpenAIEmbeddings({ model });
    return embedder.embedDocuments(texts);
  }
}


