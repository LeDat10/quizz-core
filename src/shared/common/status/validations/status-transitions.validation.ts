import { Status } from '../enums/status.enum';
import { ActionValidationResult } from '../interfaces/validation-result.interface';
import { STATUS_TRANSITIONS } from '../matrices/status-transitions.matrix';
import { validateParentChildStatusConsistency } from './parent-child-status.validation';

export const validateStatusTransition = (
  currentStatus: Status,
  newStatus: Status,
  options?: {
    entityName?: string;
    parentStatus?: Status;
    parentName?: string;
  },
): ActionValidationResult => {
  const entityName = options?.entityName || 'Entity';
  const parentStatus = options?.parentStatus;
  const parentName = options?.parentName || 'Parent';

  // No change needed
  if (currentStatus === newStatus) {
    return {
      allowed: true,
    };
  }

  //  Check if transition is allowed (basic rule)
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus];

  if (!allowedTransitions.includes(newStatus)) {
    const reasons: Record<string, string> = {
      [`${Status.PUBLISHED}-${Status.DRAFT}`]: `${entityName} cannot be reverted to DRAFT once published. Use INACTIVE to temporarily hide it.`,

      [`${Status.INACTIVE}-${Status.DRAFT}`]: `${entityName} cannot be reverted to DRAFT. Use PUBLISHED to reactivate it.`,

      [`${Status.ARCHIVED}-${Status.DRAFT}`]: `Archived ${entityName.toLowerCase()} cannot be reverted to DRAFT.`,

      [`${Status.ARCHIVED}-${Status.INACTIVE}`]: `Archived ${entityName.toLowerCase()} can only be republished, not set to INACTIVE.`,

      [`${Status.DRAFT}-${Status.INACTIVE}`]: `${entityName} must be published before it can be set to INACTIVE.`,

      [`${Status.DRAFT}-${Status.ARCHIVED}`]: `${entityName} must be published before it can be archived.`,
    };

    const key = `${currentStatus}-${newStatus}`;
    const reason =
      reasons[key] ||
      `Cannot change ${entityName.toLowerCase()} status from ${currentStatus.toUpperCase()} to ${newStatus.toUpperCase()}`;

    return {
      allowed: false,
      reason,
    };
  }

  //  If parent status is provided, validate parent-child consistency
  if (parentStatus !== undefined) {
    // Check if new status would create invalid parent-child state
    const consistencyCheck = validateParentChildStatusConsistency(
      parentStatus,
      newStatus,
      { entityName, parentName },
    );

    if (!consistencyCheck.allowed) {
      return consistencyCheck;
    }

    //  Additional parent-based constraints for status transitions

    // Cannot publish if parent is DRAFT
    if (newStatus === Status.PUBLISHED && parentStatus === Status.DRAFT) {
      return {
        allowed: false,
        reason: `Cannot publish ${entityName.toLowerCase()} while ${parentName.toLowerCase()} is still in DRAFT. Publish the ${parentName.toLowerCase()} first.`,
      };
    }

    // Cannot publish if parent is INACTIVE
    if (newStatus === Status.PUBLISHED && parentStatus === Status.INACTIVE) {
      return {
        allowed: false,
        reason: `Cannot publish ${entityName.toLowerCase()} while ${parentName.toLowerCase()} is INACTIVE. Reactivate the ${parentName.toLowerCase()} first.`,
      };
    }

    // Cannot publish if parent is ARCHIVED
    if (newStatus === Status.PUBLISHED && parentStatus === Status.ARCHIVED) {
      return {
        allowed: false,
        reason: `Cannot publish ${entityName.toLowerCase()} while ${parentName.toLowerCase()} is ARCHIVED. Restore the ${parentName.toLowerCase()} first.`,
      };
    }

    // Cannot set to INACTIVE if parent is DRAFT (invalid state)
    if (newStatus === Status.INACTIVE && parentStatus === Status.DRAFT) {
      return {
        allowed: false,
        reason: `Cannot set ${entityName.toLowerCase()} to INACTIVE in DRAFT ${parentName.toLowerCase()}. Invalid state combination.`,
      };
    }

    // Cannot set to INACTIVE if parent is ARCHIVED
    if (newStatus === Status.INACTIVE && parentStatus === Status.ARCHIVED) {
      return {
        allowed: false,
        reason: `Cannot set ${entityName.toLowerCase()} to INACTIVE while ${parentName.toLowerCase()} is ARCHIVED.`,
      };
    }

    // Cannot archive if parent is DRAFT
    if (newStatus === Status.ARCHIVED && parentStatus === Status.DRAFT) {
      return {
        allowed: false,
        reason: `Cannot archive ${entityName.toLowerCase()} in DRAFT ${parentName.toLowerCase()}. Invalid state combination.`,
      };
    }
  }

  return {
    allowed: true,
  };
};
