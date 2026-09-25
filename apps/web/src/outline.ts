import type { OutlineSection } from "./types.ts";

export function findOutline(
  nodes: OutlineSection[],
  id: string,
): OutlineSection | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findOutline(node.children, id);
    if (child) {
      return child;
    }
  }
  return null;
}

export function ancestorKeys(
  nodes: OutlineSection[],
  id: string,
  path: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.id === id) {
      return path;
    }
    const found = ancestorKeys(node.children, id, [...path, node.id]);
    if (found) {
      return found;
    }
  }
  return null;
}

export type OutlineTreeNode = {
  key: string;
  title: string;
  children: OutlineTreeNode[];
};

export function outlineTree(nodes: OutlineSection[]): OutlineTreeNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title:
      node.level === 0 && /^\d/.test(node.item)
        ? `Item ${node.item} · ${node.title}`
        : node.title,
    children: outlineTree(node.children),
  }));
}
