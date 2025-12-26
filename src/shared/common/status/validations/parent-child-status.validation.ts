import { Status } from '../enums/status.enum';
import { ActionValidationResult } from '../interfaces/validation.interface';

export const validateParentChildStatusConsistency = (
  parentStatus: Status,
  childStatus: Status,
  options?: {
    entityName?: string;
    parentName?: string;
  },
): ActionValidationResult => {
  const entityName = options?.entityName || 'Child';
  const parentName = options?.parentName || 'Parent';

  // Invalid states: Child cannot be "more advanced" than parent
  if (parentStatus === Status.DRAFT) {
    if (childStatus === Status.PUBLISHED) {
      return {
        allowed: false,
        reason: `Invalid state: ${Status.PUBLISHED} ${entityName.toLowerCase()} cannot exist in ${Status.DRAFT} ${parentName.toLowerCase()}`,
      };
    }
    if (childStatus === Status.INACTIVE) {
      return {
        allowed: false,
        reason: `Invalid state: ${Status.INACTIVE} ${entityName.toLowerCase()} cannot exist in ${Status.DRAFT} ${parentName.toLowerCase()}`,
      };
    }
    if (childStatus === Status.ARCHIVED) {
      return {
        allowed: false,
        reason: `Invalid state: ${Status.ARCHIVED} ${entityName.toLowerCase()} cannot exist in ${Status.DRAFT} ${parentName.toLowerCase()}`,
      };
    }
  }

  return { allowed: true };
};
