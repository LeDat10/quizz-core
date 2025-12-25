import { Status } from '../enums/status.enum';

export const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  [Status.DRAFT]: [
    Status.PUBLISHED, // Can publish draft
  ],
  [Status.PUBLISHED]: [
    Status.INACTIVE, // Can temporarily deactivate
    Status.ARCHIVED, // Can permanently archive
    // DRAFT is NOT allowed (one-way street)
  ],
  [Status.INACTIVE]: [
    Status.PUBLISHED, // Can reactivate
    Status.ARCHIVED, // Can archive
    // DRAFT is NOT allowed
  ],
  [Status.ARCHIVED]: [
    Status.PUBLISHED, // Can republish (rare case)
    // DRAFT and INACTIVE are NOT allowed
  ],
};
