import { Status } from '../enums/status.enum';

export const UPDATE_RULES: Record<Status, Record<Status, boolean>> = {
  [Status.DRAFT]: {
    [Status.DRAFT]: true, // DRAFT parent + DRAFT child
    [Status.PUBLISHED]: false, // Child cannot be "more advanced" than parent
    [Status.INACTIVE]: false, // Invalid state
    [Status.ARCHIVED]: false, // Invalid state
  },
  [Status.PUBLISHED]: {
    [Status.DRAFT]: true, // Can update draft child
    [Status.PUBLISHED]: true, // Can update published child
    [Status.INACTIVE]: true, // Can update inactive child (to fix issues)
    [Status.ARCHIVED]: false, // Cannot update archived child
  },
  [Status.INACTIVE]: {
    [Status.DRAFT]: false, // Parent is closed
    [Status.PUBLISHED]: false, // Parent is closed
    [Status.INACTIVE]: true, // Can update inactive child in inactive parent
    [Status.ARCHIVED]: false, // Cannot update archived child
  },
  [Status.ARCHIVED]: {
    [Status.DRAFT]: false, // Parent archived forever
    [Status.PUBLISHED]: false, // Parent archived forever
    [Status.INACTIVE]: false, // Parent archived forever
    [Status.ARCHIVED]: false, // Parent archived forever
  },
};
