import { Action } from '../enums/action.enum';
import { Status } from '../enums/status.enum';
import { ActionValidationResult } from '../interfaces/validation.interface';
import { ACTION_PERMISSIONS } from '../matrices/action-permissions.matrix';

export const validateActionOnStatus = (
  status: Status,
  action: Action,
  options?: {
    entityName?: string;
  },
): ActionValidationResult => {
  const entityName = options?.entityName || 'Entity';
  const allowedActions = ACTION_PERMISSIONS[status];

  if (!allowedActions.includes(action)) {
    const reasons: Record<string, string> = {
      [`${Status.ARCHIVED}-${Action.CREATE}`]: `Cannot create child entities in archived ${entityName.toLowerCase()}`,

      [`${Status.ARCHIVED}-${Action.UPDATE}`]: `Cannot update archived ${entityName.toLowerCase()}. Restore it first.`,

      [`${Status.ARCHIVED}-${Action.DELETE}`]: `Cannot delete archived ${entityName.toLowerCase()}. It's already archived.`,

      [`${Status.ARCHIVED}-${Action.REORDER}`]: `Cannot reorder archived ${entityName.toLowerCase()}`,

      [`${Status.INACTIVE}-${Action.CREATE}`]: `Cannot create child entities in inactive ${entityName.toLowerCase()}. Reactivate it first.`,

      [`${Status.INACTIVE}-${Action.REORDER}`]: `Cannot reorder inactive ${entityName.toLowerCase()}. Reactivate it first.`,
    };

    const key = `${status}-${action}`;
    const reason =
      reasons[key] ||
      `Cannot ${action} ${entityName.toLowerCase()} with status ${status.toUpperCase()}`;

    return {
      allowed: false,
      reason,
    };
  }

  return {
    allowed: true,
  };
};
