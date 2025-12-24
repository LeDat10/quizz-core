import { Action, MessageTemplate } from './message.types';

export const ACTION_TEMPLATES: Record<Action, MessageTemplate> = {
  start: {
    success: 'Started {entity}',
    progress: 'Starting {entity}',
    error: 'Failed to start {entity}',
  },
  created: {
    success: '{entity} created successfully',
    progress: 'Creating {entity}',
    error: 'Failed to create {entity}',
  },
  updated: {
    success: '{entity} updated successfully',
    progress: 'Updating {entity}',
    error: 'Failed to update {entity}',
  },
  deleted: {
    success: '{entity} deleted successfully',
    progress: 'Deleting {entity}',
    error: 'Failed to delete {entity}',
  },
  restored: {
    success: '{entity} restored successfully',
    progress: 'Restoring {entity}',
    error: 'Failed to restore {entity}',
  },
  fetched: {
    success: '{entity} fetched successfully',
    progress: 'Fetching {entity}',
    error: 'Failed to fetch {entity}',
  },
  failed: {
    success: '{entity} operation failed',
    progress: '{entity} operation in progress',
    error: '{entity} operation failed',
  },
  validated: {
    success: '{entity} validated successfully',
    progress: 'Validating {entity}',
    error: 'Validation failed for {entity}',
  },
  processing: {
    success: '{entity} processed successfully',
    progress: 'Processing {entity}',
    error: 'Failed to process {entity}',
  },
  completed: {
    success: '{entity} completed successfully',
    progress: 'Completing {entity}',
    error: 'Failed to complete {entity}',
  },
  skipped: {
    success: '{entity} skipped',
    progress: 'Skipping {entity}',
    error: 'Failed to skip {entity}',
  },
  cancelled: {
    success: '{entity} cancelled successfully',
    progress: 'Cancelling {entity}',
    error: 'Failed to cancel {entity}',
  },
  archived: {
    success: '{entity} archived successfully',
    progress: 'Archiving {entity}',
    error: 'Failed to archive {entity}',
  },
  activated: {
    success: '{entity} activated successfully',
    progress: 'Activating {entity}',
    error: 'Failed to activate {entity}',
  },
  deactivated: {
    success: '{entity} deactivated successfully',
    progress: 'Deactivating {entity}',
    error: 'Failed to deactivate {entity}',
  },
  imported: {
    success: '{entity} imported successfully',
    progress: 'Importing {entity}',
    error: 'Failed to import {entity}',
  },
  exported: {
    success: '{entity} exported successfully',
    progress: 'Exporting {entity}',
    error: 'Failed to export {entity}',
  },
  synced: {
    success: '{entity} synced successfully',
    progress: 'Syncing {entity}',
    error: 'Failed to sync {entity}',
  },
  sent: {
    success: '{entity} sent successfully',
    progress: 'Sending {entity}',
    error: 'Failed to send {entity}',
  },
  received: {
    success: '{entity} received successfully',
    progress: 'Receiving {entity}',
    error: 'Failed to receive {entity}',
  },
  queued: {
    success: '{entity} queued successfully',
    progress: 'Queueing {entity}',
    error: 'Failed to queue {entity}',
  },
  retrying: {
    success: '{entity} retry successful',
    progress: 'Retrying {entity}',
    error: 'Retry failed for {entity}',
  },
  warning: {
    success: '{entity} warning resolved',
    progress: '{entity} has warnings',
    error: '{entity} warning critical',
  },
  success: {
    success: '{entity} operation successful',
    progress: '{entity} operation in progress',
    error: '{entity} operation encountered issues',
  },
};
