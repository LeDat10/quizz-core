export interface EntityHierarchyConfig {
  entityName: string;
  entityTarget: string;
  parentRelation?: string; // Tên relation đến parent
  childrenRelation?: string; // Tên relation đến children
  childEntityName?: string; // Tên entity con
  order: number; // Thứ tự trong hierarchy
}
