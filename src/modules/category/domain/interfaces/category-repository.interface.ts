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
}
