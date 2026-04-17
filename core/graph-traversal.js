/**
 * Graph traversal — pure graph algorithms over Map<uid, node> / Map<uid, edge>.
 * No DOM, no rendering, no layout concerns.
 * All functions are stateless and composable.
 *
 * Return type convention:
 *   All node-returning functions return node objects (not uid strings).
 *   Callers that only need UIDs can map: result.map(n => n.uid)
 */

/**
 * Returns direct children of parentUid.
 * Children are nodes whose links array contains a link pointing to parentUid.
 * (Link direction: child.links[].targetUid === parent.uid)
 *
 * @param {string} parentUid
 * @param {Map}    nodes       Map<uid, node>
 * @returns {object[]} node[]
 */
export function getChildren(parentUid, nodes) {
    return [...nodes.values()].filter(node =>
        node.links?.some(link => link.targetUid === parentUid)
    );
}

/**
 * Returns all descendants of rootUid (recursive, depth-first).
 * Returns node objects for consistency with getChildren / getParents.
 *
 * @param {string} rootUid
 * @param {Map}    nodes
 * @returns {object[]} node[]
 */
export function getDescendants(rootUid, nodes) {
    const descendants = [];
    const visited = new Set();

    const visit = (uid) => {
        getChildren(uid, nodes).forEach(child => {
            if (visited.has(child.uid)) return;
            visited.add(child.uid);
            descendants.push(child);
            visit(child.uid);
        });
    };

    visit(rootUid);
    return descendants;
}

/**
 * Returns direct parents of nodeUid.
 * Parents are the nodes that nodeUid links to (nodeUid.links[].targetUid).
 *
 * @param {string} nodeUid
 * @param {Map}    nodes
 * @returns {object[]} node[]
 */
export function getParents(nodeUid, nodes) {
    const node = nodes.get(nodeUid);
    if (!node?.links?.length) return [];
    return node.links.map(link => nodes.get(link.targetUid)).filter(Boolean);
}

/**
 * Returns all ancestors of nodeUid (recursive, follows parent chain upward).
 * Returns node objects for consistency.
 *
 * @param {string} nodeUid
 * @param {Map}    nodes
 * @returns {object[]} node[]
 */
export function getAncestors(nodeUid, nodes) {
    const ancestors = new Map();   // uid → node, preserves insertion order, no dupes

    const visit = (uid) => {
        getParents(uid, nodes).forEach(parent => {
            if (!ancestors.has(parent.uid)) {
                ancestors.set(parent.uid, parent);
                visit(parent.uid);
            }
        });
    };

    visit(nodeUid);
    return [...ancestors.values()];
}

/**
 * Returns root nodes — nodes with no outgoing links (no parents).
 *
 * @param {Map} nodes
 * @returns {object[]} node[]
 */
export function getRoots(nodes) {
    return [...nodes.values()].filter(node => !node.links?.length);
}

/**
 * Returns all edges connected to a node (as source or target).
 *
 * @param {string} nodeUid
 * @param {Map}    edges    Map<uid, edge>
 * @returns {object[]} edge[]
 */
export function getEdgesOfNode(nodeUid, edges) {
    return [...edges.values()].filter(
        edge => edge.srcUid === nodeUid || edge.targetUid === nodeUid
    );
}

/**
 * Returns edges where nodeUid is the source.
 *
 * @param {string} nodeUid
 * @param {Map}    edges
 * @returns {object[]} edge[]
 */
export function getOutgoingEdges(nodeUid, edges) {
    return [...edges.values()].filter(edge => edge.srcUid === nodeUid);
}

/**
 * Returns edges where nodeUid is the target.
 *
 * @param {string} nodeUid
 * @param {Map}    edges
 * @returns {object[]} edge[]
 */
export function getIncomingEdges(nodeUid, edges) {
    return [...edges.values()].filter(edge => edge.targetUid === nodeUid);
}

/**
 * Checks whether two nodes share at least one common parent.
 *
 * @param {string} uidA
 * @param {string} uidB
 * @param {Map}    nodes
 * @returns {object|false} The shared parent node, or false
 */
export function findCommonParent(uidA, uidB, nodes) {
    const parentsA = new Set(getParents(uidA, nodes).map(n => n.uid));
    for (const parent of getParents(uidB, nodes)) {
        if (parentsA.has(parent.uid)) return parent;
    }
    return false;
}

/**
 * Returns the depth of a node from the nearest root (0 = root itself).
 *
 * @param {string} nodeUid
 * @param {Map}    nodes
 * @returns {number}
 */
export function getDepth(nodeUid, nodes) {
    const visited = new Set();
    let depth   = 0;
    let current = [nodeUid];

    while (current.length) {
        const next = [];
        for (const uid of current) {
            if (visited.has(uid)) continue;
            visited.add(uid);
            const parents = getParents(uid, nodes);
            if (!parents.length) return depth;
            next.push(...parents.map(p => p.uid));
        }
        current = next;
        depth++;
    }

    return depth;
}
