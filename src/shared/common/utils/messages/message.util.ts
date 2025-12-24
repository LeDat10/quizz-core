import { ACTION_TEMPLATES } from './message-templates.constant';
import { Action, MessageOptions } from './message.types';

export function generateMessage(
  action: Action,
  entity: string,
  id?: number | string,
  reason?: string,
): string {
  const entityText = id ? `${entity} with ID ${id}` : entity;
  const template = ACTION_TEMPLATES[action]?.success || '{entity} processed';
  let message = template.replace('{entity}', entityText);

  if (reason) {
    message += `: ${reason}`;
  }

  return message;
}

/**
 * Generate message nâng cao với options đầy đủ
 */
export function generateAdvancedMessage(options: MessageOptions): string {
  const {
    action,
    entity,
    id,
    reason,
    count,
    duration,
    metadata,
    status = 'success',
    customTemplate,
  } = options;

  if (customTemplate) {
    return customTemplate
      .replace('{entity}', entity)
      .replace('{id}', String(id || ''))
      .replace('{reason}', reason || '')
      .replace('{count}', String(count || ''));
  }

  // Build entity text
  let entityText = entity;
  if (id) {
    entityText = `${entity} [ID: ${id}]`;
  }
  if (count !== undefined && count > 1) {
    entityText = `${count} ${entity}${count > 1 ? 's' : ''}`;
  }

  // Get template based on status
  const templates = ACTION_TEMPLATES[action];
  let template: string;

  switch (status) {
    case 'error':
      template = templates?.error || '{entity} operation failed';
      break;
    case 'warning':
      template = templates?.progress || '{entity} operation has warnings';
      break;
    case 'pending':
      template = templates?.progress || '{entity} operation in progress';
      break;
    default:
      template = templates?.success || '{entity} processed';
  }

  // Replace placeholders
  let message = template.replace('{entity}', entityText);

  // Add duration if present
  if (duration !== undefined) {
    message += ` (${duration}ms)`;
  }

  // Add reason
  if (reason) {
    message += `: ${reason}`;
  }

  // Add metadata as JSON string if present
  if (metadata && Object.keys(metadata).length > 0) {
    const metaStr = Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    message += ` [${metaStr}]`;
  }

  return message;
}

/**
 * Generate batch operation message
 */
export function generateBatchMessage(
  action: Action,
  entity: string,
  total: number,
  successful: number,
  failed: number,
  reason?: string,
): string {
  const message = `Batch ${action} ${entity}: ${successful}/${total} successful`;

  if (failed > 0) {
    return `${message}, ${failed} failed${reason ? `: ${reason}` : ''}`;
  }

  return message;
}

/**
 * Generate progress message
 */
export function generateProgressMessage(
  action: Action,
  entity: string,
  current: number,
  total: number,
): string {
  const percentage = Math.round((current / total) * 100);
  return `${ACTION_TEMPLATES[action]?.progress.replace('{entity}', entity)}: ${current}/${total} (${percentage}%)`;
}

/**
 * Generate comparison message
 */
export function generateComparisonMessage(
  entity: string,
  oldValue: any,
  newValue: any,
  field?: string,
): string {
  const fieldText = field ? ` ${field}` : '';
  return `${entity}${fieldText} changed from "${oldValue}" to "${newValue}"`;
}

/**
 * Generate relationship message
 */
export function generateRelationMessage(
  action: 'attached' | 'detached' | 'linked' | 'unlinked',
  parentEntity: string,
  parentId: number | string,
  childEntity: string,
  childId: number | string,
): string {
  const actionText = {
    attached: 'attached to',
    detached: 'detached from',
    linked: 'linked to',
    unlinked: 'unlinked from',
  }[action];

  return `${childEntity} [${childId}] ${actionText} ${parentEntity} [${parentId}]`;
}
