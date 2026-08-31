/**
 * @file graph-algorithms.js
 * Graph algorithms — BFS propagation, reachability, shortest path, all paths.
 * Pure functions over a GraphAbstract. No domain knowledge.
 */

// ── Internal ─────────────────────────────────────────────────────────────────

function _getNeighbors(graph, uid, direction, edgeTypes) {
    const results = [];

    if (direction === 'downstream' || direction === 'both') {
        const edges = edgeTypes
            ? edgeTypes.flatMap(t => graph.getOutgoing(uid, t))
            : graph.getOutgoing(uid);
        for (const e of edges) results.push(e.targetUid);
    }

    if (direction === 'upstream' || direction === 'both') {
        const edges = edgeTypes
            ? edgeTypes.flatMap(t => graph.getIncoming(uid, t))
            : graph.getIncoming(uid);
        for (const e of edges) results.push(e.srcUid);
    }

    return results;
}

function _getOutEdges(graph, uid, direction, edgeTypes) {
    const results = [];

    if (direction === 'downstream' || direction === 'both') {
        const edges = edgeTypes
            ? edgeTypes.flatMap(t => graph.getOutgoing(uid, t))
            : graph.getOutgoing(uid);
        for (const e of edges) results.push({ neighbor: e.targetUid, edge: e });
    }

    if (direction === 'upstream' || direction === 'both') {
        const edges = edgeTypes
            ? edgeTypes.flatMap(t => graph.getIncoming(uid, t))
            : graph.getIncoming(uid);
        for (const e of edges) results.push({ neighbor: e.srcUid, edge: e });
    }

    return results;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * BFS propagation from a source node. Returns each reached node with
 * its depth and the node it was reached through.
 *
 * @param {import('./graph-abstract.js').GraphAbstract} graph
 * @param {string} fromUid
 * @param {object} [options]
 * @param {'downstream'|'upstream'|'both'} [options.direction='downstream']
 * @param {string[]} [options.edgeTypes]
 * @param {number} [options.maxDepth=Infinity]
 * @param {function} [options.filter] — (node) => boolean, skip nodes that fail
 * @returns {{ uid: string, depth: number, via: string }[]}
 */
export function propagate(graph, fromUid, options = {}) {
    const { direction = 'downstream', edgeTypes, maxDepth = Infinity, filter } = options;

    const visited = new Map();
    const queue   = [{ uid: fromUid, depth: 0, via: null }];
    visited.set(fromUid, { depth: 0, via: null });

    while (queue.length) {
        const { uid, depth } = queue.shift();
        if (depth >= maxDepth) continue;

        const neighbors = _getNeighbors(graph, uid, direction, edgeTypes);
        for (const nUid of neighbors) {
            if (visited.has(nUid)) continue;
            if (filter) {
                const node = graph.getNode(nUid);
                if (node && !filter(node)) continue;
            }
            const entry = { depth: depth + 1, via: uid };
            visited.set(nUid, entry);
            queue.push({ uid: nUid, depth: depth + 1 });
        }
    }

    visited.delete(fromUid);

    const result = [];
    for (const [uid, info] of visited) {
        result.push({ uid, depth: info.depth, via: info.via });
    }
    return result;
}

/**
 * Find all nodes reachable from a source via BFS.
 *
 * @param {import('./graph-abstract.js').GraphAbstract} graph
 * @param {string} fromUid
 * @param {object} [options]
 * @param {'downstream'|'upstream'|'both'} [options.direction='downstream']
 * @param {string[]} [options.edgeTypes]
 * @param {number} [options.maxDepth=Infinity]
 * @returns {string[]} — reachable node uids (excludes fromUid)
 */
export function reachable(graph, fromUid, options = {}) {
    const { direction = 'downstream', edgeTypes, maxDepth = Infinity } = options;

    const visited = new Set([fromUid]);
    const queue   = [{ uid: fromUid, depth: 0 }];

    while (queue.length) {
        const { uid, depth } = queue.shift();
        if (depth >= maxDepth) continue;

        const neighbors = _getNeighbors(graph, uid, direction, edgeTypes);
        for (const nUid of neighbors) {
            if (visited.has(nUid)) continue;
            visited.add(nUid);
            queue.push({ uid: nUid, depth: depth + 1 });
        }
    }

    visited.delete(fromUid);
    return [...visited];
}

/**
 * Dijkstra's shortest path between two nodes.
 *
 * @param {import('./graph-abstract.js').GraphAbstract} graph
 * @param {string} fromUid
 * @param {string} toUid
 * @param {object} [options]
 * @param {'downstream'|'upstream'|'both'} [options.direction='downstream']
 * @param {string[]} [options.edgeTypes]
 * @param {function} [options.cost] — (edge) => number, default: () => 1
 * @returns {{ path: string[], cost: number } | null}
 */
export function shortestPath(graph, fromUid, toUid, options = {}) {
    const { direction = 'downstream', edgeTypes, cost = () => 1 } = options;

    const dist    = new Map([[fromUid, 0]]);
    const prev    = new Map();
    const visited = new Set();
    const queue   = [{ uid: fromUid, d: 0 }];

    while (queue.length) {
        queue.sort((a, b) => a.d - b.d);
        const { uid, d } = queue.shift();

        if (uid === toUid) {
            const path = [];
            let cur = toUid;
            while (cur !== undefined) {
                path.unshift(cur);
                cur = prev.get(cur);
            }
            return { path, cost: d };
        }

        if (visited.has(uid)) continue;
        visited.add(uid);

        const edges = _getOutEdges(graph, uid, direction, edgeTypes);
        for (const { neighbor, edge } of edges) {
            if (visited.has(neighbor)) continue;
            const newDist = d + cost(edge);
            if (!dist.has(neighbor) || newDist < dist.get(neighbor)) {
                dist.set(neighbor, newDist);
                prev.set(neighbor, uid);
                queue.push({ uid: neighbor, d: newDist });
            }
        }
    }

    return null;
}

/**
 * Find all simple paths between two nodes via depth-limited DFS.
 *
 * @param {import('./graph-abstract.js').GraphAbstract} graph
 * @param {string} fromUid
 * @param {string} toUid
 * @param {object} [options]
 * @param {'downstream'|'upstream'|'both'} [options.direction='downstream']
 * @param {string[]} [options.edgeTypes]
 * @param {number} [options.maxDepth=20]
 * @param {function} [options.cost] — (edge) => number, default: () => 1
 * @returns {{ path: string[], cost: number }[]}
 */
export function allPaths(graph, fromUid, toUid, options = {}) {
    const { direction = 'downstream', edgeTypes, maxDepth = 20, cost = () => 1 } = options;
    const results = [];

    function dfs(uid, path, totalCost, visited) {
        if (uid === toUid) {
            results.push({ path: [...path], cost: totalCost });
            return;
        }
        if (path.length > maxDepth) return;

        const edges = _getOutEdges(graph, uid, direction, edgeTypes);
        for (const { neighbor, edge } of edges) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            path.push(neighbor);
            dfs(neighbor, path, totalCost + cost(edge), visited);
            path.pop();
            visited.delete(neighbor);
        }
    }

    const visited = new Set([fromUid]);
    dfs(fromUid, [fromUid], 0, visited);
    return results;
}
