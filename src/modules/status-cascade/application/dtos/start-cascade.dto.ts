import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Status } from 'src/shared/common/status';
import { entityType } from 'src/shared/infrastructure/queues/types/queue.types';

export class StartCascadeDto {
  @IsString()
  entityType: entityType;

  @IsString()
  entityId: string;

  @IsEnum(Status)
  newStatus: Status;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class BulkCascadeDto {
  updates: Array<{
    entityType: string;
    entityId: string;
    newStatus: Status;
  }>;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
