import { IsOptional, IsString, IsObject, IsBoolean } from 'class-validator';

export class CreateThreadDto {
  @IsString()
  agent!: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  userMessage?: string;

  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;
}


