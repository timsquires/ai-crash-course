import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ThreadEntity } from '../threads/infra/postgres/thread.entity';
import {
  ThreadModel,
  ThreadSchema,
} from '../threads/infra/mongo/thread.schema';

@Module({
  imports: [
    ...(process.env.PERSISTENCE === 'mongo'
      ? [
          MongooseModule.forFeature([
            { name: ThreadModel.name, schema: ThreadSchema },
          ]),
        ]
      : [TypeOrmModule.forFeature([ThreadEntity])]),
  ],
  exports: [
    ...(process.env.PERSISTENCE === 'mongo'
      ? [MongooseModule]
      : [TypeOrmModule]),
  ],
})
export class ModelsModule {}
