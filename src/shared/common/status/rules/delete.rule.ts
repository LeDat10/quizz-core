import { Status } from '../enums/status.enum';

export const DELETE_RULES: Record<Status, Record<Status, boolean>> = {
  [Status.DRAFT]: {
    [Status.DRAFT]: true,
    [Status.PUBLISHED]: false,
    [Status.INACTIVE]: false,
    [Status.ARCHIVED]: false,
  },
  [Status.PUBLISHED]: {
    [Status.DRAFT]: true, // OK - can delete draft child
    [Status.PUBLISHED]: false, // OK - can delete published child
    [Status.INACTIVE]: true, // Inactive child should use restore instead
    [Status.ARCHIVED]: true, // Cannot delete already archived child
  },
  [Status.INACTIVE]: {
    [Status.DRAFT]: false,
    [Status.PUBLISHED]: false,
    [Status.INACTIVE]: false,
    [Status.ARCHIVED]: false,
  },
  [Status.ARCHIVED]: {
    [Status.DRAFT]: false,
    [Status.PUBLISHED]: false,
    [Status.INACTIVE]: false,
    [Status.ARCHIVED]: false,
  },
};
