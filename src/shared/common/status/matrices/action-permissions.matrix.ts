import { Action } from '../enums/action.enum';
import { Status } from '../enums/status.enum';

export const ACTION_PERMISSIONS: Record<Status, Action[]> = {
  [Status.DRAFT]: [
    Action.CREATE, // Can create child entities
    Action.UPDATE, // Can update content
    Action.DELETE, // Can soft delete
    Action.REORDER, // Can reorder
  ],
  [Status.PUBLISHED]: [
    Action.CREATE, // Can create child entities
    Action.UPDATE, // Can update content
    Action.DELETE, // Can soft delete
    Action.REORDER, // Can reorder
  ],
  [Status.INACTIVE]: [
    Action.UPDATE, // Can update (to fix issues)
    Action.DELETE, // Can soft delete
    Action.RESTORE, // Can restore if soft-deleted
    // CREATE and REORDER not allowed while inactive
  ],
  [Status.ARCHIVED]: [
    Action.RESTORE, // Only restore is allowed
    // All other actions blocked
  ],
};
