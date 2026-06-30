/**
 * GraphAbstract — a pure combinatorial graph.
 *
 * Vertices (nodes) and edges only. No coordinates, no geometry, no embedding,
 * no ports, no render styles. The mathematical foundation of graph theory:
 * a graph defined entirely by its connectivity.
 *
 * Relationship to GraphStore:
 *   GraphStore is an embedded graph — GraphAbstract plus geometric embedding
 *   (node positions, SVG edge paths, port geometry, layout). GraphAbstract is
 *   the abstract structure that GraphStore builds on top of.
 *
 * Use GraphAbstract when:
 *   - Connectivity and typed relationships are what matter (knowledge graphs,
 *     dependency graphs, AI session memory, environment knowledge)
 *   - There is no visual rendering concern
 *
 * Use GraphStore when:
 *   - Nodes have positions in a canvas and edges are drawn as paths
 *
 * ── Node shape ──────────────────────────────────────────────────────────────
 *
 *   { uid, type, label, data }
 *
 * ── Edge shape ──────────────────────────────────────────────────────────────
 *
 *   { uid, srcUid, targetUid, type, data }
 *
 *   Edge uid defaults to `${type}:${srcUid}→${targetUid}`.
 *   This makes each (type, src, target) triple naturally unique, so multiple
 *   edge types between the same node pair are fully supported.
 *
 * ── Events ──────────────────────────────────────────────────────────────────
 *
 *   nodes:changed  { op: 'add'|'update'|'remove', uid }
 *   edges:changed  { op: 'add'|'update'|'remove', uid }
 */

import { EventBus }                              from './event-bus.js';
import { getOutgoingEdges, getIncomingEdges,
         getEdgesOfNode }                        from './graph-traversal.js';

export class GraphAbstract extends EventBus {
    #nodes = new Map();   // uid → node
    #edges = new Map();   // uid → edge

    // ── Nodes ─────────────────────────────────────────────────────────────────

    /**
     * Add or upsert a node. If uid already exists, merges data shallowly.
     * @param {{ uid: string, type?: string, label?: string, data?: object }}
     * @returns {object} the stored node
     */
    addNode({ uid, type = 'continuant', label = '', data = {} }) {
        const existing = this.#nodes.get(uid);
        if (existing) {
            const updated = { ...existing, type, label, data: { ...existing.data, ...data } };
            this.#nodes.set(uid, updated);
            this.emit('nodes:changed', { op: 'update', uid });
            return updated;
        }
        const node = { uid, type, label, data };
        this.#nodes.set(uid, node);
        this.emit('nodes:changed', { op: 'add', uid });
        return node;
    }

    /**
     * Shallow-merge a patch into an existing node.
     * patch.data is merged into node.data, not replaced.
     * Returns null if the node does not exist.
     */
    updateNode(uid, patch) {
        const node = this.#nodes.get(uid);
        if (!node) return null;
        const updated = { ...node, ...patch, data: { ...node.data, ...(patch.data ?? {}) } };
        this.#nodes.set(uid, updated);
        this.emit('nodes:changed', { op: 'update', uid });
        return updated;
    }

    /**
     * Remove a node and all edges connected to it.
     * Returns true if the node existed.
     */
    removeNode(uid) {
        if (!this.#nodes.has(uid)) return false;
        for (const [edgeUid, edge] of this.#edges) {
            if (edge.srcUid === uid || edge.targetUid === uid) this.#edges.delete(edgeUid);
        }
        this.#nodes.delete(uid);
        this.emit('nodes:changed', { op: 'remove', uid });
        this.emit('edges:changed', { op: 'remove', reason: 'node-removed', nodeUid: uid });
        return true;
    }

    getNode(uid)  { return this.#nodes.get(uid) ?? null; }
    hasNode(uid)  { return this.#nodes.has(uid); }
    getNodes()    { return [...this.#nodes.values()]; }
    nodeCount()   { return this.#nodes.size; }

    // ── Edges ─────────────────────────────────────────────────────────────────

    /**
     * Add or upsert a directed typed edge.
     *
     * uid defaults to `${type}:${srcUid}→${targetUid}` — one per
     * (type, src, target) triple. Pass an explicit uid for finer control.
     *
     * Returns null (with console.warn) if either node is missing.
     * @param {{ uid?: string, srcUid: string, targetUid: string, type?: string, data?: object }}
     * @returns {object|null} the stored edge
     */
    addEdge({ uid, srcUid, targetUid, type = 'default', data = {} }) {
        if (!this.#nodes.has(srcUid)) {
            console.warn(`[GraphAbstract] addEdge: src not found — ${srcUid}`);
            return null;
        }
        if (!this.#nodes.has(targetUid)) {
            console.warn(`[GraphAbstract] addEdge: target not found — ${targetUid}`);
            return null;
        }
        const edgeUid = uid ?? `${type}:${srcUid}→${targetUid}`;
        const existing = this.#edges.get(edgeUid);
        if (existing) {
            const updated = { ...existing, data: { ...existing.data, ...data } };
            this.#edges.set(edgeUid, updated);
            this.emit('edges:changed', { op: 'update', uid: edgeUid });
            return updated;
        }
        const edge = { uid: edgeUid, srcUid, targetUid, type, data };
        this.#edges.set(edgeUid, edge);
        this.emit('edges:changed', { op: 'add', uid: edgeUid });
        return edge;
    }

    /**
     * Remove a single edge by uid. Returns true if it existed.
     */
    removeEdge(uid) {
        if (!this.#edges.has(uid)) return false;
        this.#edges.delete(uid);
        this.emit('edges:changed', { op: 'remove', uid });
        return true;
    }

    getEdge(uid)  { return this.#edges.get(uid) ?? null; }
    hasEdge(uid)  { return this.#edges.has(uid); }
    getEdges()    { return [...this.#edges.values()]; }
    edgeCount()   { return this.#edges.size; }

    // ── Traversal ─────────────────────────────────────────────────────────────

    /**
     * All edges leaving srcUid, optionally filtered to a specific type.
     * @param {string}  srcUid
     * @param {string=} type  — omit for all outgoing edges
     * @returns {object[]} edge[]
     */
    getOutgoing(srcUid, type) {
        const all = getOutgoingEdges(srcUid, this.#edges);
        return type !== undefined ? all.filter(e => e.type === type) : all;
    }

    /**
     * All edges entering targetUid, optionally filtered to a specific type.
     * @param {string}  targetUid
     * @param {string=} type
     * @returns {object[]} edge[]
     */
    getIncoming(targetUid, type) {
        const all = getIncomingEdges(targetUid, this.#edges);
        return type !== undefined ? all.filter(e => e.type === type) : all;
    }

    /**
     * All edges connected to nodeUid (in or out), optionally filtered by type.
     * @param {string}  nodeUid
     * @param {string=} type
     * @returns {object[]} edge[]
     */
    getEdgesOf(nodeUid, type) {
        const all = getEdgesOfNode(nodeUid, this.#edges);
        return type !== undefined ? all.filter(e => e.type === type) : all;
    }

    /**
     * BFS — all nodes reachable from startUid via outgoing edges of the given
     * type. Does not include startUid itself.
     * @param {string}  startUid
     * @param {string=} type  — omit to traverse all edge types
     * @returns {object[]} node[]
     */
    reachable(startUid, type) {
        const visited = new Set();
        const queue   = [startUid];
        while (queue.length) {
            const uid = queue.shift();
            if (visited.has(uid)) continue;
            visited.add(uid);
            for (const edge of this.getOutgoing(uid, type)) {
                if (!visited.has(edge.targetUid)) queue.push(edge.targetUid);
            }
        }
        visited.delete(startUid);
        return [...visited].map(uid => this.#nodes.get(uid)).filter(Boolean);
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /** All nodes of a given type. */
    getNodesByType(type) {
        return [...this.#nodes.values()].filter(n => n.type === type);
    }

    /** All edges of a given type. */
    getEdgesByType(type) {
        return [...this.#edges.values()].filter(e => e.type === type);
    }

    // ── Serialise / hydrate ───────────────────────────────────────────────────

    /**
     * Export a plain-object snapshot. Safe for JSON.stringify.
     * Round-trips cleanly through serialise → JSON → hydrate.
     * @returns {{ version: number, nodes: object[], edges: object[] }}
     */
    serialise() {
        return {
            version: 1,
            nodes:   this.getNodes(),
            edges:   this.getEdges(),
        };
    }

    /**
     * Restore from a snapshot produced by serialise().
     * Clears existing state. Emits no events during restore.
     * @param {{ nodes: object[], edges: object[] }} snapshot
     */
    hydrate(snapshot) {
        this.#nodes.clear();
        this.#edges.clear();
        for (const n of snapshot.nodes ?? []) this.#nodes.set(n.uid, n);
        for (const e of snapshot.edges ?? []) this.#edges.set(e.uid, e);
    }

    /**
     * Deep clone via serialise round-trip.
     * @returns {GraphAbstract}
     */
    clone() {
        const copy = new GraphAbstract();
        copy.hydrate(this.serialise());
        return copy;
    }
}
