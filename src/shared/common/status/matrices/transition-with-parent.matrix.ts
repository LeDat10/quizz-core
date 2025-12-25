import { Status } from '../enums/status.enum';

export const STATUS_TRANSITION_WITH_PARENT: Record<
  Status,
  Record<Status, Record<Status, boolean>>
> = {
  [Status.DRAFT]: {
    [Status.DRAFT]: {
      [Status.DRAFT]: true, // No change
      [Status.PUBLISHED]: true, // No change
      [Status.INACTIVE]: true, // No change
      [Status.ARCHIVED]: true, // No change
    },
    [Status.PUBLISHED]: {
      [Status.DRAFT]: false, //  Cannot publish while parent is draft
      [Status.PUBLISHED]: true, //  Can publish in published parent
      [Status.INACTIVE]: false, //  Cannot publish while parent is inactive
      [Status.ARCHIVED]: false, //  Cannot publish while parent is archived
    },
    [Status.INACTIVE]: {
      [Status.DRAFT]: false, //  Invalid state
      [Status.PUBLISHED]: false, //  Invalid transition
      [Status.INACTIVE]: false, //  Invalid transition
      [Status.ARCHIVED]: false, //  Invalid transition
    },
    [Status.ARCHIVED]: {
      [Status.DRAFT]: false, //  Invalid state
      [Status.PUBLISHED]: false, //  Invalid transition
      [Status.INACTIVE]: false, //  Invalid transition
      [Status.ARCHIVED]: false, //  Invalid transition
    },
  },
  [Status.PUBLISHED]: {
    [Status.DRAFT]: {
      // Not allowed - one-way street
      [Status.DRAFT]: false,
      [Status.PUBLISHED]: false,
      [Status.INACTIVE]: false,
      [Status.ARCHIVED]: false,
    },
    [Status.PUBLISHED]: {
      [Status.DRAFT]: true, // No change
      [Status.PUBLISHED]: true, // No change
      [Status.INACTIVE]: true, // No change
      [Status.ARCHIVED]: true, // No change
    },
    [Status.INACTIVE]: {
      [Status.DRAFT]: false, //  Invalid - parent too low
      [Status.PUBLISHED]: true, //  Can deactivate in published parent
      [Status.INACTIVE]: true, //  Can deactivate in inactive parent
      [Status.ARCHIVED]: false, //  Cannot deactivate in archived parent
    },
    [Status.ARCHIVED]: {
      [Status.DRAFT]: false, //  Invalid - parent too low
      [Status.PUBLISHED]: true, //  Can archive in published parent
      [Status.INACTIVE]: true, //  Can archive in inactive parent
      [Status.ARCHIVED]: true, //  Can archive in archived parent
    },
  },
  [Status.INACTIVE]: {
    [Status.DRAFT]: {
      // Not allowed
      [Status.DRAFT]: false,
      [Status.PUBLISHED]: false,
      [Status.INACTIVE]: false,
      [Status.ARCHIVED]: false,
    },
    [Status.PUBLISHED]: {
      [Status.DRAFT]: false, //  Invalid - parent too low
      [Status.PUBLISHED]: true, //  Can reactivate in published parent
      [Status.INACTIVE]: false, //  Cannot reactivate if parent inactive
      [Status.ARCHIVED]: false, //  Cannot reactivate if parent archived
    },
    [Status.INACTIVE]: {
      [Status.DRAFT]: true, // No change
      [Status.PUBLISHED]: true, // No change
      [Status.INACTIVE]: true, // No change
      [Status.ARCHIVED]: true, // No change
    },
    [Status.ARCHIVED]: {
      [Status.DRAFT]: false, //  Invalid
      [Status.PUBLISHED]: true, //  Can archive in published parent
      [Status.INACTIVE]: true, //  Can archive in inactive parent
      [Status.ARCHIVED]: true, //  Can archive in archived parent
    },
  },
  [Status.ARCHIVED]: {
    [Status.DRAFT]: {
      // Not allowed
      [Status.DRAFT]: false,
      [Status.PUBLISHED]: false,
      [Status.INACTIVE]: false,
      [Status.ARCHIVED]: false,
    },
    [Status.PUBLISHED]: {
      [Status.DRAFT]: false, //  Invalid - parent too low
      [Status.PUBLISHED]: true, //  Can republish in published parent
      [Status.INACTIVE]: false, //  Cannot republish if parent inactive
      [Status.ARCHIVED]: false, //  Cannot republish if parent archived
    },
    [Status.INACTIVE]: {
      // Not allowed
      [Status.DRAFT]: false,
      [Status.PUBLISHED]: false,
      [Status.INACTIVE]: false,
      [Status.ARCHIVED]: false,
    },
    [Status.ARCHIVED]: {
      [Status.DRAFT]: true, // No change
      [Status.PUBLISHED]: true, // No change
      [Status.INACTIVE]: true, // No change
      [Status.ARCHIVED]: true, // No change
    },
  },
};
