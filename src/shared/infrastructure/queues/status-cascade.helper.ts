import { ENTITY_HIERARCHY } from './status-cascade.constant';
import { EntityHierarchyConfig } from './status-cascade.interface';

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
