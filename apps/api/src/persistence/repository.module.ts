import { Module } from '@nestjs/common';
import { ModelsModule } from './models.module';
import { THREAD_REPOSITORY } from '../threads/ports/thread.repository';
import { PgThreadRepository } from '../threads/infra/postgres/thread.repository.pg';
import { MongoThreadRepository } from '../threads/infra/mongo/thread.repository.mongo';
import { DOCUMENT_REPOSITORY } from '../knowledge/ports/document.repository';
import { CHUNK_REPOSITORY } from '../knowledge/ports/chunk.repository';
import { PgDocumentRepository } from '../knowledge/infra/postgres/document.repository.pg';
import { PgChunkRepository } from '../knowledge/infra/postgres/chunk.repository.pg';
import { MongoDocumentRepository } from '../knowledge/infra/mongo/document.repository.mongo';
import { MongoChunkRepository } from '../knowledge/infra/mongo/chunk.repository.mongo';

@Module({
  imports: [ModelsModule],
  providers: [
    {
      provide: THREAD_REPOSITORY,
      useClass:
        (process.env.PERSISTENCE || 'postgres') === 'postgres'
          ? PgThreadRepository
          : MongoThreadRepository,
    },
    {
      provide: DOCUMENT_REPOSITORY,
      useClass:
        (process.env.PERSISTENCE || 'postgres') === 'postgres'
          ? PgDocumentRepository
          : MongoDocumentRepository,
    },
    {
      provide: CHUNK_REPOSITORY,
      useClass:
        (process.env.PERSISTENCE || 'postgres') === 'postgres'
          ? PgChunkRepository
          : MongoChunkRepository,
    },
  ],
  exports: [THREAD_REPOSITORY, DOCUMENT_REPOSITORY, CHUNK_REPOSITORY],
})
export class RepositoryModule {}
