import { QueryRunner } from 'typeorm';
import { Category } from '../entities/category.entity';

export interface CategoryRepository {
  findById(id: string): Promise<Category | null>;
  findBySlug(slug: string): Promise<Category | null>;
  findAndLockBySlug(
    slug: string,
    queryRunner: QueryRunner,
  ): Promise<Category | null>;
  save(category: Category): Promise<Category>;
  maxPosition(): Promise<number>;
  findByPosition(position: number): Promise<Category | null>;
  swapPositions(
    categoryA: Category,
    categoryB: Category,
    queryRunner: QueryRunner,
  ): Promise<{ categoryA: Category; categoryB: Category }>;
}
