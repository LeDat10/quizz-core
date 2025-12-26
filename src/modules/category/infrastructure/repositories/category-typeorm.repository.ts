import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../../domain/interfaces/category-repository.interface';
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
    return this.repository.findOneBy({ slug });
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

  findByPosition(position: number): Promise<Category | null> {
    return this.repository.findOneBy({ position });
  }

  save(category: Category): Promise<Category> {
    return this.repository.save(category);
  }

  async maxPosition(): Promise<number> {
    const result: { max: string | null } | undefined = await this.repository
      .createQueryBuilder('category')
      .select('MAX(category.position)', 'max')
      .getRawOne();

    const maxPosition = result?.max ? Number(result.max) : 0;
    return maxPosition;
  }

  async swapPositions(
    categoryA: Category,
    categoryB: Category,
    queryRunner: QueryRunner,
  ): Promise<{ categoryA: Category; categoryB: Category }> {
    const tempPosition = -1;
    await queryRunner.manager.update(
      Category,
      { id: categoryA.id },
      { position: tempPosition },
    );

    await queryRunner.manager.update(
      Category,
      { id: categoryB.id },
      { position: categoryA.position },
    );

    await queryRunner.manager.update(
      Category,
      { id: categoryA.id },
      { position: categoryB.position },
    );

    categoryA.position = categoryB.position;
    categoryB.position = categoryA.position;

    return { categoryA, categoryB };
    // const temp = categoryA.position;
    // categoryA.position = categoryB.position;
    // categoryB.position = temp;

    // const saved = await queryRunner.manager.save([categoryA, categoryB]);

    // return { categoryA: saved[0], categoryB: saved[1] };
  }
}
