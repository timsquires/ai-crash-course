import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ThreadEntity } from '../threads/infra/postgres/thread.entity';
import { DocumentEntity } from '../knowledge/infra/postgres/document.entity';
import { ChunkEntity } from '../knowledge/infra/postgres/chunk.entity';
import { ThreadModel, ThreadSchema } from '../threads/infra/mongo/thread.schema';
import { DocumentModel, DocumentSchema } from '../knowledge/infra/mongo/document.schema';
import { ChunkModel, ChunkSchema } from '../knowledge/infra/mongo/chunk.schema';

@Module({
  imports: [
    ...(process.env.PERSISTENCE === 'postgres' ? [TypeOrmModule.forFeature([ThreadEntity, DocumentEntity, ChunkEntity])] : []),
    ...(process.env.PERSISTENCE === 'mongo'
      ? [MongooseModule.forFeature([
          { name: ThreadModel.name, schema: ThreadSchema },
          { name: DocumentModel.name, schema: DocumentSchema },
          { name: ChunkModel.name, schema: ChunkSchema },
        ])]
      : []),
  ],
  exports: [
    ...(process.env.PERSISTENCE === 'postgres' ? [TypeOrmModule] : []),
    ...(process.env.PERSISTENCE === 'mongo' ? [MongooseModule] : []),
  ],
})
export class ModelsModule {}


