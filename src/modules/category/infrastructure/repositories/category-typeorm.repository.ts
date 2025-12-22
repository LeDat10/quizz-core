import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../../domain/interfaces/category-repository.interfact';
import { Category } from '../../domain/entities/category.entity';
import { QueryRunner, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class CategoryTypeOrmRepository implements CategoryRepository {
  constructor(
    @InjectRepository(Category)
    private readonly repository: Repository<Category>,
  ) {}
  findById(id: string): Promise<Category | null> {
    return this.repository.findOneBy({ id });
  }
  findBySlug(slug: string): Promise<Category | null> {
    throw new Error('Method not implemented.');
  }
  findAndLockBySlug(
    slug: string,
    queryRunner: QueryRunner,
  ): Promise<Category | null> {
    return queryRunner.manager
      .createQueryBuilder(Category, 'category')
      .where('category.slug = :slug', { slug })
      .setLock('pessimistic_write', undefined, ['chapter'])
      .getOne();
  }
  save(category: Category): Promise<Category> {
    return this.repository.save(category);
  }
}
