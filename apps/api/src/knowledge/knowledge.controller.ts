import { Controller, Delete, Post, UploadedFiles, UseInterceptors, BadRequestException, Query } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import type { Express } from 'express';
import 'multer';

@Controller('documents')
export class KnowledgeController {
  constructor(private readonly svc: KnowledgeService) {}

  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor())
  async upload(@UploadedFiles() files: Express.Multer.File[], @Query('accountId') accountId?: string) {
    if (!accountId) throw new BadRequestException('accountId is required');
    return this.svc.ingest(files ?? [], accountId);
  }

  @Delete()
  async deleteAll(@Query('accountId') accountId?: string) {
    if (!accountId) throw new BadRequestException('accountId is required');
    return this.svc.deleteAll(accountId);
  }
}


