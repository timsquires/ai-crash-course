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
    TypeOrmModule.forFeature([ThreadEntity]),
    MongooseModule.forFeature([
      { name: ThreadModel.name, schema: ThreadSchema },
    ]),
  ],
  exports: [TypeOrmModule, MongooseModule],
})
export class ModelsModule {}
