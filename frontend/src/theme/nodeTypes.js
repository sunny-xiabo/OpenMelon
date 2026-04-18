import nodeTypeConfigs from '../../../backend/config/node_types.json';

export const FALLBACK_NODE_TYPE = 'Entity';
export const NODE_TYPE_OVERRIDES_STORAGE_KEY = 'graph-node-type-overrides';
export const NODE_TYPE_OVERRIDES_UPDATED_EVENT = 'graph-node-type-overrides-updated';

export const NODE_TYPE_META = Object.fromEntries(
  nodeTypeConfigs.map((item) => [
    item.type,
    {
      category: item.category,
      color: item.color,
      size: item.size,
    },
  ]),
);

export const NODE_TYPE_LEGEND = nodeTypeConfigs.map((item) => ({
  type: item.type,
  category: item.category,
  color: item.color,
  size: item.size,
}));

export function getNodeVisualMeta(nodeType) {
  const rawType = nodeType || FALLBACK_NODE_TYPE;
  const meta = NODE_TYPE_META[rawType];
  if (meta) {
    return { type: rawType, visualType: rawType, ...meta };
  }
  return {
    type: rawType,
    visualType: FALLBACK_NODE_TYPE,
    category: 'extendable',
    color: NODE_TYPE_META[FALLBACK_NODE_TYPE].color,
    size: NODE_TYPE_META[FALLBACK_NODE_TYPE].size,
  };
}

export function buildNodeTypeHelpers(configs = []) {
  if (!configs.length) {
    return {
      legend: NODE_TYPE_LEGEND,
      getVisualMeta: getNodeVisualMeta,
    };
  }

  const metaMap = Object.fromEntries(
    configs.map((item) => [
      item.type,
      {
        locked: item.locked,
        constraints: item.constraints,
        category: item.category,
        color: item.color,
        size: item.size,
      },
    ]),
  );

  const legend = configs.map((item) => ({
    type: item.type,
    locked: item.locked,
    constraints: item.constraints,
    category: item.category,
    color: item.color,
    size: item.size,
  }));

  const getVisualMeta = (nodeType) => {
    const rawType = nodeType || FALLBACK_NODE_TYPE;
    const meta = metaMap[rawType];
    if (meta) {
      return { type: rawType, visualType: rawType, ...meta };
    }
    return {
      type: rawType,
      visualType: FALLBACK_NODE_TYPE,
      category: 'extendable',
      color: metaMap[FALLBACK_NODE_TYPE]?.color || NODE_TYPE_META[FALLBACK_NODE_TYPE].color,
      size: metaMap[FALLBACK_NODE_TYPE]?.size || NODE_TYPE_META[FALLBACK_NODE_TYPE].size,
    };
  };

  return { legend, getVisualMeta };
}

export function loadNodeTypeOverrides() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(NODE_TYPE_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveNodeTypeOverrides(overrides) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    NODE_TYPE_OVERRIDES_STORAGE_KEY,
    JSON.stringify(overrides || {}),
  );
  window.dispatchEvent(new Event(NODE_TYPE_OVERRIDES_UPDATED_EVENT));
}

export function mergeNodeTypeConfigs(configs = [], overrides = {}) {
  return configs.map((item) => {
    const override = overrides[item.type];
    if (!override) return item;
    return {
      ...item,
      color: {
        bg: override.bg || item.color.bg,
        border: override.border || item.color.border,
      },
      size: Number.isFinite(Number(override.size)) ? Number(override.size) : item.size,
    };
  });
}
