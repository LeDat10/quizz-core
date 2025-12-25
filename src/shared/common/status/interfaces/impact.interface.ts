import { EntityTarget, ObjectLiteral, QueryRunner } from 'typeorm';
import { Status } from '../enums/status.enum';

export interface AutoFixChildrenOptions {
  statusFieldName?: string;
  dryRun?: boolean;
  skipValidation?: boolean;
  additionalUpdates?: Partial<ObjectLiteral>;
}

export interface StatusImpactResult {
  updatedCount: number;
  affectedIds: string[];
  targetStatus: Status | null;
  reason: string;
  cascadedLevels?: CascadeLevelResult[];
}

export interface CascadeLevelResult {
  level: number;
  entityName: string;
  updatedCount: number;
  affectedIds: string[];
  targetStatus: Status | null;
}

export interface CascadeLevel<T extends ObjectLiteral> {
  entityTarget: EntityTarget<T>;
  children: T[];
  parentIdField?: string; // Tên field chứa parent ID (để query children của children)
  getChildren?: (queryRunner: QueryRunner, parentIds: string[]) => Promise<T[]>; // Function để lấy children level tiếp theo
}
