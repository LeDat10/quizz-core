import { entityType } from 'src/shared/infrastructure/queues/domain/types/status-cascade.types';
import { EntityHierarchyConfig } from '../interfaces/entity-config.interface';

export const ENTITY_HIERARCHY: EntityHierarchyConfig[] = [
  {
    entityName: 'category',
    entityTarget: 'Category',
    childrenRelation: 'courses',
    childEntityName: 'course',
    order: 1,
  },
  {
    entityName: 'course',
    entityTarget: 'Course',
    parentRelation: 'category',
    childrenRelation: 'chapters',
    childEntityName: 'chapter',
    order: 2,
  },
  {
    entityName: 'chapter',
    entityTarget: 'Chapter',
    parentRelation: 'course',
    childrenRelation: 'lessons',
    childEntityName: 'lesson',
    order: 3,
  },
  {
    entityName: 'lesson',
    entityTarget: 'Lesson',
    parentRelation: 'chapter',
    order: 4,
  },
];

export function getEntityConfig(
  entityName: string,
): EntityHierarchyConfig | undefined {
  return ENTITY_HIERARCHY.find((e) => e.entityName === entityName);
}

export function getChildrenConfigs(
  entityName: string,
): EntityHierarchyConfig[] {
  const config = getEntityConfig(entityName);
  if (!config || !config.childEntityName) return [];

  const result: EntityHierarchyConfig[] = [];
  let currentConfig = getEntityConfig(config.childEntityName);

  while (currentConfig) {
    result.push(currentConfig);
    currentConfig = currentConfig.childEntityName
      ? getEntityConfig(currentConfig.childEntityName)
      : undefined;
  }

  return result;
}

export function getMaxCascadeLevels(entityType: entityType): number {
  const hierarchy = {
    category: 3,
    course: 2,
    chapter: 1,
    lesson: 0,
  };
  return hierarchy[entityType] ?? 0;
}
