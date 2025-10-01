import { Module } from '@nestjs/common';
import { RepositoryModule } from '../persistence/repository.module';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { SlidingWindowChunker } from './chunking/sliding-window.chunker';
import { RestaurantSectionChunker } from './chunking/restaurant-section.chunker';
import { CHUNKING_STRATEGY } from './chunking/chunking.strategy';
import { DocumentLoaderService } from './document-loader.service';
import { EmbeddingsService } from './embeddings.service';

@Module({
  imports: [RepositoryModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    DocumentLoaderService,
    EmbeddingsService,
    // Replace the useClass value with a different chunking strategy if you want to use a different one
    { provide: CHUNKING_STRATEGY, useClass: RestaurantSectionChunker },
  ],
  exports: [KnowledgeService, CHUNKING_STRATEGY],
})
export class KnowledgeModule {}
