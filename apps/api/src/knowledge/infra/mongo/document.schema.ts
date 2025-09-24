import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'documents', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class DocumentModel {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  accountId!: string;

  @Prop({ type: String, required: true })
  filename!: string;

  @Prop({ type: String, required: true })
  mimeType!: string;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

export type DocumentDoc = HydratedDocument<DocumentModel>;
export const DocumentSchema = SchemaFactory.createForClass(DocumentModel);


