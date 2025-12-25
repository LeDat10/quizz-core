import { Status } from '../enums/status.enum';
import { ActionValidationResult } from '../interfaces/validation-result.interface';
import { PARENT_STATUS_CHANGE_RULES } from '../rules/parent-change.rules';

export const validateParentStatusChange = (
  currentParentStatus: Status,
  newParentStatus: Status,
  childrenStatuses: Status[],
  options?: {
    parentName?: string;
    childName?: string;
  },
): ActionValidationResult => {
  const parentName = (options?.parentName || 'Parent').toLowerCase();
  const childName = (options?.childName || 'Child').toLowerCase();

  if (!childrenStatuses?.length || currentParentStatus === newParentStatus) {
    return { allowed: true };
  }

  const rules = PARENT_STATUS_CHANGE_RULES[newParentStatus] || [];
  const invalidChildren: { status: Status; reason: string }[] = [];

  childrenStatuses.forEach((childStatus) => {
    rules.forEach((rule) => {
      if (rule.disallowedChildStatuses.includes(childStatus)) {
        invalidChildren.push({
          status: childStatus,
          reason: rule.reason(parentName, childName),
        });
      }
    });
  });

  if (!invalidChildren.length) {
    return { allowed: true };
  }

  const statusSummary = Object.entries(
    invalidChildren.reduce(
      (acc, { status }) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<Status, number>,
    ),
  )
    .map(([status, count]) => `${count} ${status.toUpperCase()}`)
    .join(', ');

  return {
    allowed: false,
    reason: `Cannot change ${parentName} from ${currentParentStatus.toUpperCase()} to ${newParentStatus.toUpperCase()}. Has ${statusSummary} ${childName}(s). ${invalidChildren[0].reason}`,
  };
};
