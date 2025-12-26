import { BadRequestException, Injectable } from '@nestjs/common';
import {
  StatusEntity,
  StatusValidationConfig,
} from '../interfaces/validation.interface';
import { Action } from '../enums/action.enum';
import { canPerformAction } from '../validations/can-perform-action.validation';
import { Status } from '../enums/status.enum';
import { validateStatusTransition } from '../validations/status-transitions.validation';
import { validateParentStatusChange } from '../validations/parent-status.validation';

@Injectable()
export class StatusValidationService {
  validateUpdate<T extends StatusEntity>(
    entity: T,
    config: StatusValidationConfig<T>,
  ): void {
    if (!config.getParentStatus) {
      return;
    }

    const parentStatus = config.getParentStatus(entity);
    if (!parentStatus) {
      return;
    }

    const { allowed, reason } = canPerformAction(
      parentStatus,
      entity.status,
      Action.UPDATE,
    );

    if (!allowed) {
      throw new BadRequestException(
        `Cannot update ${config.entityName}: ${reason}`,
      );
    }

    // Run custom validations
    if (config.customValidations) {
      config.customValidations.forEach((validator) => validator(entity));
    }
  }

  /**
   * Validate status transition (current -> new)
   */
  validateTransition<T extends StatusEntity>(
    entity: T,
    newStatus: Status,
    config: StatusValidationConfig<T>,
  ): void {
    const transition = validateStatusTransition(entity.status, newStatus);

    if (!transition.allowed) {
      throw new BadRequestException(
        `Cannot transition ${config.entityName} from ${entity.status} to ${newStatus}: ${transition.reason}`,
      );
    }

    // Run custom validations with new status
    if (config.customValidations) {
      config.customValidations.forEach((validator) =>
        validator(entity, newStatus),
      );
    }
  }

  /**
   * Validate với children (parent-child consistency)
   */
  validateWithChildren<T extends StatusEntity>(
    entity: T,
    newStatus: Status,
    config: StatusValidationConfig<T>,
  ): void {
    // Get child statuses
    let childStatuses: Status[] = [];

    if (config.getChildren) {
      const children = config.getChildren(entity);
      if (!children?.length) {
        return; // No children to validate
      }
      childStatuses = children.map((c) => c.status);
    } else if (config.getChildStatuses) {
      childStatuses = config.getChildStatuses(entity);
      if (!childStatuses?.length) {
        return;
      }
    } else {
      return; // No child config
    }

    // Validate parent status change with children
    const parentValidation = validateParentStatusChange(
      entity.status,
      newStatus,
      childStatuses,
    );

    if (!parentValidation.allowed) {
      throw new BadRequestException(
        `Cannot change ${config.entityName} status to ${newStatus}: ${parentValidation.reason}`,
      );
    }
  }

  /**
   * Validate tất cả: update + transition + children
   * One-stop validation for complete status change
   */
  validateComplete<T extends StatusEntity>(
    entity: T,
    newStatus: Status,
    config: StatusValidationConfig<T>,
  ): void {
    // 1. Validate parent allows update
    this.validateUpdate(entity, config);

    // 2. Validate transition is allowed
    this.validateTransition(entity, newStatus, config);

    // 3. Validate children compatibility
    this.validateWithChildren(entity, newStatus, config);
  }
}
