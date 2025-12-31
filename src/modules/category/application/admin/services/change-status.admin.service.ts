import { HttpException, Inject, NotFoundException } from '@nestjs/common';
import { CategoryRepository } from 'src/modules/category/domain/interfaces/category-repository.interface';
import { ErrorHandlerHelper } from 'src/shared/common/errors';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { StatusValidationService } from 'src/shared/common/status/services/status-validation.service';
import { CategoryMapper } from '../mappers/category.mapper';
import { Status } from 'src/shared/common/status';
import { validateUUID } from 'src/shared/common/uuid';
import { Category } from 'src/modules/category/domain/entities/category.entity';
import { StatusCascadeService } from 'src/modules/status-cascade/application/services/status-cascade.service';
import { ResponseFactory } from 'src/shared/common/http';
import { AdminResponseCategoryDto } from '../dtos/admin-response-category.admin.dto';
import { generateMessage } from 'src/shared/common/messaging';

export class ChangeCategoryStatusAdminService {
  private logger: LoggerHelper;
  private errorHandler: ErrorHandlerHelper;
  private readonly ENTITY_NAME = 'Category';
  private readonly MAX_RETRIES = 5;
  private readonly LOCK_TTL = 5000;

  constructor(
    // repository
    @Inject('CATEGORY_REPOSITORY')
    private readonly categoryRepository: CategoryRepository,

    // services
    private readonly statusValidationService: StatusValidationService,
    private readonly statusCascadeService: StatusCascadeService,

    // helpers
    private readonly categoryMapper: CategoryMapper,
  ) {
    this.logger = new LoggerHelper(ChangeCategoryStatusAdminService.name);
    this.errorHandler = new ErrorHandlerHelper(
      ChangeCategoryStatusAdminService.name,
    );
  }

  async execute(id: string, newStatus: Status) {
    const ctx: LoggerContext = {
      method: 'execute',
      entity: 'Category',
    };

    const traceId = this.logger.start(ctx, {
      operation: 'updateCategory',
    });

    try {
      if (!id) {
        const reason = `Category id is not found`;
        this.logger.error(ctx, reason, 'updated', { traceId });
        throw new NotFoundException(reason);
      }

      validateUUID(id, ctx, this.logger, 'catgory id');

      const category = await this.categoryRepository.findById(id);

      if (!category) {
        const reason = `Category with ID ${id} not found`;
        this.logger.error(ctx, reason, 'failed', { traceId });
        throw new HttpException(reason, 404);
      }

      this.statusValidationService.validateTransition<Category>(
        category,
        newStatus,
        {
          entityName: 'Category',
        },
      );

      this.statusValidationService.validateWithChildren<Category>(
        category,
        newStatus,
        {
          entityName: this.ENTITY_NAME,
        },
      );

      category.status = newStatus;

      await this.categoryRepository.save(category);

      this.logger.checkpoint(traceId, 'start-cascade-status', ctx);

      try {
        await this.statusCascadeService.startCascade(
          {
            entityType: 'category',
            entityId: category.id,
            newStatus: newStatus,
          },
          '1',
        );
      } catch (error: any) {
        this.logger.error(ctx, error as Error, 'updated', { traceId });
      }

      this.logger.success(
        {
          ...ctx,
          id: category.id,
        },
        traceId,
        'updated',
        {
          ...category,
        },
      );

      return ResponseFactory.success<AdminResponseCategoryDto>(
        this.categoryMapper.toAdminResponseDto(category),
        generateMessage('updated', this.ENTITY_NAME, category.id),
      );
    } catch (error) {
      this.logger.checkpoint(traceId, 'error-occurred', ctx, {
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      });
      return this.errorHandler.handle(ctx, error, this.ENTITY_NAME);
    }
  }
}
