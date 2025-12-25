import { Status } from '../enums/status.enum';

export const getAllowedChildStatuses = (newParentStatus: Status): Status[] => {
  const allowedChildren: Record<Status, Status[]> = {
    [Status.DRAFT]: [
      Status.DRAFT, // Only draft children allowed in draft parent
    ],
    [Status.PUBLISHED]: [
      Status.DRAFT, // Can have draft children (being worked on)
      Status.PUBLISHED, // Can have published children
      Status.INACTIVE, // Can have inactive children (temporarily hidden)
      Status.ARCHIVED, // Can have archived children (old content)
    ],
    [Status.INACTIVE]: [
      Status.INACTIVE, // Can have inactive children
      Status.ARCHIVED, // Can have archived children
      // DRAFT and PUBLISHED children become inaccessible
    ],
    [Status.ARCHIVED]: [
      Status.ARCHIVED, // Only archived children make sense
      // Could allow INACTIVE too, but let's be strict
    ],
  };

  return allowedChildren[newParentStatus] || [];
};

export const analyzeStatusChangeImpact = (
  newParentStatus: Status,
  childrenStatuses: Status[],
  options?: {
    parentName?: string;
    childName?: string;
  },
): {
  willMakeInaccessible: boolean;
  affectedChildren: Status[];
  recommendation: string;
} => {
  const parentName = options?.parentName || 'Parent';
  const childName = options?.childName || 'children';

  const allowedChildren = getAllowedChildStatuses(newParentStatus);
  const affectedChildren = childrenStatuses.filter(
    (status) => !allowedChildren.includes(status),
  );

  if (affectedChildren.length === 0) {
    return {
      willMakeInaccessible: false,
      affectedChildren: [],
      recommendation: `Safe to change ${parentName.toLowerCase()} to ${newParentStatus.toUpperCase()}.`,
    };
  }

  const affectedCount = affectedChildren.reduce(
    (acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<Status, number>,
  );

  const affectedSummary = Object.entries(affectedCount)
    .map(([status, count]) => `${count} ${status.toUpperCase()}`)
    .join(', ');

  let recommendation = '';

  if (newParentStatus === Status.INACTIVE) {
    recommendation = `Deactivate ${affectedSummary} ${childName} first, or they will become inaccessible to users.`;
  } else if (newParentStatus === Status.ARCHIVED) {
    recommendation = `Archive ${affectedSummary} ${childName} first to maintain clean state.`;
  } else if (newParentStatus === Status.DRAFT) {
    recommendation = `Cannot revert to DRAFT with ${affectedSummary} ${childName}. This would create invalid state.`;
  }

  return {
    willMakeInaccessible: true,
    affectedChildren,
    recommendation,
  };
};
