import type { TreeNode, TreeNodeType } from "@/types/database";
import { findSidebarActionTarget } from "@/lib/sidebar/sidebarActionTarget";

const accordionDatabaseNodeTypes = new Set<TreeNodeType>(["database", "mongo-db", "vector-database"]);

export function syncSidebarTreeNodeExpansion(nodes: readonly TreeNode[], renderedNode: TreeNode, expanded: boolean): boolean {
  const liveNode = findSidebarActionTarget(nodes, renderedNode);
  if (!liveNode || liveNode === renderedNode || liveNode.isExpanded === expanded) return false;
  liveNode.isExpanded = expanded;
  return true;
}

/**
 * Keeps database expansion accordion-like within one connection.
 *
 * A rendered search/layout projection may not share object identity with the
 * live store tree, so resolve the opened node before walking the tree.
 */
export function collapseOtherExpandedDatabases(nodes: readonly TreeNode[], openedNode: TreeNode): number {
  if (!accordionDatabaseNodeTypes.has(openedNode.type) || !openedNode.connectionId) return 0;

  const liveOpenedNode = findSidebarActionTarget(nodes, openedNode) ?? openedNode;
  const visited = new WeakSet<TreeNode>();
  let collapsedCount = 0;

  const collapseOthers = (treeNodes: readonly TreeNode[]) => {
    for (const node of treeNodes) {
      if (visited.has(node)) continue;
      visited.add(node);
      if (node !== liveOpenedNode && accordionDatabaseNodeTypes.has(node.type) && node.connectionId === openedNode.connectionId && node.isExpanded) {
        node.isExpanded = false;
        collapsedCount += 1;
      }
      if (node.children?.length) collapseOthers(node.children);
      if (node.hiddenChildren?.length) collapseOthers(node.hiddenChildren);
    }
  };

  collapseOthers(nodes);
  return collapsedCount;
}
