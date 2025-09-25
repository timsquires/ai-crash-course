import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    ...(process.env.PERSISTENCE === 'postgres' || !process.env.PERSISTENCE
      ? [
          TypeOrmModule.forRoot({
            type: 'postgres' as const,
            url:
              process.env.POSTGRES_URL ||
              'postgresql://postgres:postgres@localhost:5432/ai_crash_course',
            autoLoadEntities: true,
            synchronize: false,
          } as any),
        ]
      : []),
    ...(process.env.PERSISTENCE === 'mongo'
      ? [MongooseModule.forRoot(process.env.MONGO_URL as string)]
      : []),
  ],
})
export class PersistenceModule {}
