import { EntityHierarchyConfig } from './status-cascade.interface';

export const STATUS_CASCADE_QUEUE = 'status-cascade';

export const STATUS_CASCADE_DLQ = 'status-cascade-dlq'; // Dead Letter Queue

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
