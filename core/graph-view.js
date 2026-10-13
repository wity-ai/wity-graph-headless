/**
 * @file graph-view.js
 * Read-only views of a graph, and the two structural facts an L2 needs to state about one: the order of a node's
 * lines, and which kinds of node a kind of line may join.
 *
 *   viewOf(graph, { node })      the graph seen through a filter on its nodes — only the nodes that pass, and only
 *                                the edges between two of them. It answers what the algorithms ask of a graph
 *                                (getNodes, getNode, hasNode, getEdges, getOutgoing, getIncoming, getEdgesOf), so
 *                                propagate / reachable / shortestPath / allPaths run over a view unchanged. A view
 *                                holds no copy: it reads the graph as it is at each call.
 *   ordered(edges)               edges in their stated order: by `data.order` (a number), then as they were added.
 *   checkJoins(graph, rules)     which edges join kinds of node their type does not allow.
 *
 * Pure: no domain knowledge, no DOM.
 */

/**
 * @param {object} graph   a GraphAbstract, or another view
 * @param {object} filter
 * @param {(node: object) => boolean} filter.node   which nodes are in the view
 * @returns {object} the view (read-only)
 */
export function viewOf(graph, { node: keep }) {
    if (typeof keep !== 'function') throw new Error('[graph-headless] viewOf needs { node: (node) => boolean }');
    const has = (uid) => { const n = graph.getNode(uid); return !!n && keep(n); };
    const between = (e) => has(e.srcUid) && has(e.targetUid);
    const view = {
        getNodes:    () => graph.getNodes().filter(keep),
        getNode:     (uid) => (has(uid) ? graph.getNode(uid) : null),
        hasNode:     has,
        nodeCount:   () => view.getNodes().length,
        getEdges:    () => graph.getEdges().filter(between),
        getEdge:     (uid) => { const e = graph.getEdge(uid); return e && between(e) ? e : null; },
        edgeCount:   () => view.getEdges().length,
        getOutgoing: (uid, type) => (has(uid) ? graph.getOutgoing(uid, type).filter((e) => has(e.targetUid)) : []),
        getIncoming: (uid, type) => (has(uid) ? graph.getIncoming(uid, type).filter((e) => has(e.srcUid)) : []),
        getEdgesOf:  (uid, type) => (has(uid) ? graph.getEdgesOf(uid, type).filter(between) : []),
        getNodesByType: (type) => view.getNodes().filter((n) => n.type === type),
        getEdgesByType: (type) => view.getEdges().filter((e) => e.type === type),
    };
    return Object.freeze(view);
}

/**
 * Edges in their stated order — for lines whose order means something (the first and second child of a node in a
 * syntax tree, the arguments of a call). Order is `data.order` (a number), lowest first; edges without one follow, in
 * the order given. Stable. Returns a new array.
 */
export function ordered(edges) {
    const at = (e) => (typeof e?.data?.order === 'number' && Number.isFinite(e.data.order) ? e.data.order : Infinity);
    return edges.map((e, i) => [e, at(e), i]).sort((x, y) => (x[1] - y[1]) || (x[2] - y[2])).map(([e]) => e);
}

/**
 * Which edges join kinds of node their type does not allow.
 *
 * @param {object} graph   a graph or a view
 * @param {{ [edgeType: string]: { pairs: [string, string][] } | { from: string[], to: string[] } }} rules   for each
 *        governed edge type, the joins it may make: `pairs` lists each allowed [fromType, toType] (a Petri net's arc:
 *        [['place', 'transition'], ['transition', 'place']]); `from` / `to` allow any of those to any of these.
 *        Edges of a type not named are not governed.
 * @returns {{ edge: string, type: string, from: string, to: string, fromType: string|null, toType: string|null }[]}
 *          in the graph's edge order — empty when every governed edge is allowed
 */
export function checkJoins(graph, rules) {
    const out = [];
    for (const e of graph.getEdges()) {
        const rule = rules[e.type];
        if (!rule) continue;
        const fromType = graph.getNode(e.srcUid)?.type ?? null;
        const toType = graph.getNode(e.targetUid)?.type ?? null;
        const pairs = rule.pairs ?? null;
        const allowed = pairs ? pairs.some(([a, b]) => a === fromType && b === toType) : rule.from.includes(fromType) && rule.to.includes(toType);
        if (!allowed) out.push({ edge: e.uid, type: e.type, from: e.srcUid, to: e.targetUid, fromType, toType });
    }
    return out;
}
