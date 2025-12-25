import { validate as isUUID, version } from 'uuid';
import { LoggerContext, LoggerHelper } from '../logging';
import { ValidateIdsOptions } from './uuid.interface';
import { BadRequestException } from '@nestjs/common';

export const isValidUUIDv4 = (id: string): boolean => {
  return typeof id === 'string' && isUUID(id) && version(id) === 4;
};

export const validateUUIDArray = (
  ids: string[],
  ctx: LoggerContext,
  logger: LoggerHelper,
  options: ValidateIdsOptions = {},
): void => {
  const { max = 100, name = 'ids' } = options;

  // Check if ids is provided
  if (!ids) {
    const reason = `${name} parameter is required`;
    logger.warn(ctx, 'failed', reason, { field: name });
    throw new BadRequestException(reason);
  }

  // Check if ids is an array
  if (!Array.isArray(ids)) {
    const reason = `${name} must be an array`;
    logger.warn(ctx, 'failed', reason, {
      field: name,
      receivedType: typeof ids,
    });
    throw new BadRequestException(reason);
  }

  // Check if array is empty
  if (ids.length === 0) {
    const reason = `${name} array must not be empty`;
    logger.warn(ctx, 'failed', reason, { field: name });
    throw new BadRequestException(reason);
  }

  // Check max length
  if (ids.length > max) {
    const reason = `Cannot process more than ${max} items at once. Received: ${ids.length}`;
    logger.warn(ctx, 'failed', reason, {
      field: name,
      maxAllowed: max,
      received: ids.length,
    });
    throw new BadRequestException(reason);
  }
};

export const validateUUID = (
  id: string,
  ctx: LoggerContext,
  logger: LoggerHelper,
  fieldName = 'id',
): void => {
  // Check if id is provided
  if (!id) {
    const reason = `Missing parameter ${fieldName}`;
    logger.warn(ctx, 'failed', reason, { field: fieldName });
    throw new BadRequestException(reason);
  }

  // Check UUID format
  if (!isValidUUIDv4(id)) {
    const reason = `Invalid UUID format for ${fieldName}: ${id}. Expected UUID v4 format.`;
    logger.warn(ctx, 'failed', reason, {
      field: fieldName,
      receivedValue: id,
      expectedFormat: 'UUID v4',
    });
    throw new BadRequestException(reason);
  }
};
