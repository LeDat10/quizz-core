import { Action } from '../enums/action.enum';
import { Status } from '../enums/status.enum';
import { ActionValidationResult } from '../interfaces/validation.interface';
import { DELETE_RULES } from '../rules/delete.rule';
import { RESTORE_RULES } from '../rules/restore.rule';
import { UPDATE_RULES } from '../rules/update.rule';
import { validateActionOnStatus } from './action.validation';

export const canPerformAction = (
  parentStatus: Status,
  childStatus: Status | null, // null for CREATE action
  action: Action,
  options?: {
    entityName?: string;
    parentName?: string;
  },
): ActionValidationResult => {
  const entityName = options?.entityName || 'Entity';
  const parentName = options?.parentName || 'Parent';

  switch (action) {
    case Action.CREATE: {
      // Check if parent allows creating children
      const createValidation = validateActionOnStatus(
        parentStatus,
        Action.CREATE,
        {
          entityName: parentName,
        },
      );

      if (!createValidation.allowed) {
        return createValidation;
      }

      // Additional parent status checks
      if (parentStatus === Status.ARCHIVED) {
        return {
          allowed: false,
          reason: `Cannot create ${entityName.toLowerCase()} in archived ${parentName.toLowerCase()}`,
        };
      }

      // if (parentStatus === Status.INACTIVE) {
      //   return {
      //     allowed: false,
      //     reason: `Cannot create ${entityName.toLowerCase()} in inactive ${parentName.toLowerCase()}. Reactivate the ${parentName.toLowerCase()} first.`,
      //   };
      // }

      return { allowed: true };
    }
    case Action.UPDATE: {
      if (!childStatus) {
        return {
          allowed: false,
          reason: `${entityName} status is required for update action`,
        };
      }

      //  Use UPDATE_RULES matrix
      const updateAllowed = UPDATE_RULES[parentStatus]?.[childStatus];

      if (updateAllowed === false) {
        return {
          allowed: false,
          reason: `Cannot update ${childStatus.toLowerCase()} ${entityName.toLowerCase()} in ${parentStatus.toLowerCase()} ${parentName.toLowerCase()}`,
        };
      }

      return { allowed: true };
    }
    case Action.DELETE: {
      if (!childStatus) {
        return {
          allowed: false,
          reason: `${entityName} status is required for delete action`,
        };
      }

      // Use DELETE_RULES matrix
      const deleteAllowed = DELETE_RULES[parentStatus]?.[childStatus];

      if (deleteAllowed === false) {
        return {
          allowed: false,
          reason: `Cannot delete ${childStatus.toLowerCase()} ${entityName.toLowerCase()} from ${parentStatus.toLowerCase()} ${parentName.toLowerCase()}`,
        };
      }

      return { allowed: true };
    }
    // case Action.REORDER:
    //   // Check if parent allows reordering
    //   const reorderValidation = validateActionOnStatus(
    //     parentStatus,
    //     Action.REORDER,
    //     {
    //       entityName: parentName,
    //     },
    //   );

    //   if (!reorderValidation.allowed) {
    //     return reorderValidation;
    //   }

    //   if (parentStatus === Status.ARCHIVED) {
    //     return {
    //       allowed: false,
    //       reason: `Cannot reorder ${entityName.toLowerCase()} in archived ${parentName.toLowerCase()}`,
    //     };
    //   }

    //   if (parentStatus === Status.INACTIVE) {
    //     return {
    //       allowed: false,
    //       reason: `Cannot reorder ${entityName.toLowerCase()} in inactive ${parentName.toLowerCase()}. Reactivate it first.`,
    //     };
    //   }

    //   return { allowed: true };

    case Action.RESTORE: {
      if (!childStatus) {
        return {
          allowed: false,
          reason: `${entityName} status is required for restore action`,
        };
      }

      //  Use RESTORE_RULES matrix
      const restoreAllowed = RESTORE_RULES[parentStatus]?.[childStatus];

      if (restoreAllowed === false) {
        return {
          allowed: false,
          reason: `Cannot restore ${childStatus.toLowerCase()} ${entityName.toLowerCase()} to ${parentStatus.toLowerCase()} ${parentName.toLowerCase()}`,
        };
      }

      return { allowed: true };
    }
    default:
      return {
        allowed: false,
        reason: `Unknown action: ${action}`,
      };
  }
};
