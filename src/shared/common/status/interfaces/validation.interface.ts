import { Status } from '../enums/status.enum';

export interface ActionValidationResult {
  allowed: boolean;
  reason?: string;
}

export interface StatusEntity {
  status: Status;
  [key: string]: any;
}

export interface StatusValidationConfig<T extends StatusEntity> {
  entityName: string; // 'Chapter', 'Course', 'Lesson'
  getParentStatus?: (entity: T) => Status | null; // Get parent status
  getChildren?: (entity: T) => StatusEntity[] | null; // Get children
  getChildStatuses?: (entity: T) => Status[]; // Alternative: direct status array
  customValidations?: Array<(entity: T, newStatus?: Status) => void>; // Custom rules
}
