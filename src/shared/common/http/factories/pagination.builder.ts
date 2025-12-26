import { PaginationMeta, PaginationLinks } from '../interfaces';
import { PaginationResponse } from '../dtos/responses';
import {
  NormalizedPaginationParams,
  PaginationOptions,
} from '../types/pagination.types';

export class PaginationBuilder {
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly MAX_LIMIT = 100;

  /**
   * Build complete pagination response with HATEOAS links
   */
  static build<T>(
    data: T[],
    options: PaginationOptions,
  ): PaginationResponse<T> {
    const { page, limit, total, path, query = {} } = options;

    const totalPages = Math.ceil(total / limit);

    const meta: PaginationMeta = {
      itemsPerPage: limit,
      totalItems: total,
      currentPage: page,
      totalPages,
    };

    const links: PaginationLinks = {
      first: this.buildLink(path, 1, limit, query),
      last: this.buildLink(path, totalPages, limit, query),
      current: this.buildLink(path, page, limit, query),
      next:
        page < totalPages ? this.buildLink(path, page + 1, limit, query) : null,
      previous: page > 1 ? this.buildLink(path, page - 1, limit, query) : null,
    };

    return new PaginationResponse(data, meta, links);
  }

  /**
   * Build URL with query parameters
   */
  private static buildLink(
    path: string,
    page: number,
    limit: number,
    additionalQuery: Record<string, any> = {},
  ): string {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...this.serializeQuery(additionalQuery),
    });

    return `${path}?${params.toString()}`;
  }

  /**
   * Serialize query object to string values
   */
  private static serializeQuery(
    query: Record<string, any>,
  ): Record<string, string> {
    const serialized: Record<string, string> = {};

    for (const [key, value] of Object.entries(query)) {
      if (
        value !== undefined &&
        value !== null &&
        key !== 'page' &&
        key !== 'limit'
      ) {
        serialized[key] = String(value);
      }
    }

    return serialized;
  }

  /**
   * Calculate offset from page and limit
   */
  static getOffset(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  /**
   * Validate and normalize pagination params
   */
  static normalizePaginationParams(
    page?: number,
    limit?: number,
    maxLimit = this.MAX_LIMIT,
  ): NormalizedPaginationParams {
    const normalizedPage = Math.max(
      this.DEFAULT_PAGE,
      page || this.DEFAULT_PAGE,
    );
    const normalizedLimit = Math.min(
      maxLimit,
      Math.max(1, limit || this.DEFAULT_LIMIT),
    );

    return {
      page: normalizedPage,
      limit: normalizedLimit,
      offset: this.getOffset(normalizedPage, normalizedLimit),
    };
  }

  /**
   * Check if there is a next page
   */
  static hasNextPage(page: number, limit: number, total: number): boolean {
    const totalPages = Math.ceil(total / limit);
    return page < totalPages;
  }

  /**
   * Check if there is a previous page
   */
  static hasPreviousPage(page: number): boolean {
    return page > 1;
  }

  /**
   * Get total pages count
   */
  static getTotalPages(total: number, limit: number): number {
    return Math.ceil(total / limit);
  }
}
