import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'chunks', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class ChunkModel {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  documentId!: string;

  @Prop({ type: String, required: true })
  accountId!: string;

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  // Embedding stored as numeric array; for production use Atlas $vectorSearch
  @Prop({ type: [Number], required: true })
  embedding!: number[];

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

export type ChunkDoc = HydratedDocument<ChunkModel>;
export const ChunkSchema = SchemaFactory.createForClass(ChunkModel);


