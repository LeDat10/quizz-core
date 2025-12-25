import { Status } from '../enums/status.enum';

type ParentChangeRule = {
  disallowedChildStatuses: Status[];
  reason: (parent: string, child: string) => string;
};

export const PARENT_STATUS_CHANGE_RULES: Record<Status, ParentChangeRule[]> = {
  [Status.DRAFT]: [
    {
      disallowedChildStatuses: [Status.PUBLISHED],
      reason: (p, c) =>
        `Cannot set ${p} to DRAFT while having PUBLISHED ${c}(s). Children cannot be "more advanced" than parent.`,
    },
    {
      disallowedChildStatuses: [Status.INACTIVE],
      reason: (p, c) =>
        `Cannot set ${p} to DRAFT while having INACTIVE ${c}(s). Invalid state combination.`,
    },
    {
      disallowedChildStatuses: [Status.ARCHIVED],
      reason: (p, c) =>
        `Cannot set ${p} to DRAFT while having ARCHIVED ${c}(s). Invalid state combination.`,
    },
  ],

  [Status.INACTIVE]: [
    // {
    //   disallowedChildStatuses: [Status.PUBLISHED],
    //   reason: (p, c) =>
    //     `Cannot set ${p} to INACTIVE while having PUBLISHED ${c}(s). Deactivate children first.`,
    // },
  ],

  [Status.ARCHIVED]: [
    // {
    //   disallowedChildStatuses: [Status.PUBLISHED],
    //   reason: (p, c) =>
    //     `Cannot archive ${p} while having PUBLISHED ${c}(s). Archive or deactivate children first.`,
    // },
    // {
    //   disallowedChildStatuses: [Status.INACTIVE],
    //   reason: (p, c) =>
    //     `Cannot archive ${p} while having INACTIVE ${c}(s). Archive children first.`,
    // },
  ],

  [Status.PUBLISHED]: [],
};
