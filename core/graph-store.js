/**
 * GraphStore — the central headless state container.
 *
 * Owns all graph data (nodes, edges), drives layout, and emits events.
 * Has no DOM, no D3, no rendering concerns.
 * The rendering layer subscribes to events and reads data from this store.
 *
 * Events emitted:
 *   'nodes:changed'       { nodes: node[] }           — after any node mutation
 *   'edges:changed'       { edges: edge[] }            — after any edge mutation
 *   'layout:computed'     { nodes, edges }             — after layout is run
 *   'node:removed'        { uid, descendants: node[] } — before removal (SelectionManager auto-deselects)
 *   'node:moved'          { uid, x, y, node }          — after moveNode()
 *   'node:status-changed' { uid, status, node }        — after setNodeStatus()
 */

import { EventBus }  from './event-bus.js';
import { computeLayout as runHorizontalLayout } from '../layout/horizontal-tree.js';
import { computeNodeLinkPath }  from '../geometry/link-path.js';
import { getNodeTypeConfig, DEFAULT_NODE_TYPE } from '../ontology/node-types.js';
import { getLinkTypeConfig }                    from '../ontology/link-types.js';
import { getDefaultOutputPortId, getDefaultInputPortId } from '../geometry/port-geometry.js';
import {
    getChildren,
    getDescendants,
    getParents,
    getAncestors,
    getRoots,
    getEdgesOfNode,
    getOutgoingEdges,
    getIncomingEdges,
    findCommonParent,
    getDepth,
} from './graph-traversal.js';
import { getNodesAroundPoint } from '../layout/spatial.js';

function randomUid() {
    return Math.random().toString(36).slice(2, 8);
}

export class GraphStore extends EventBus {
    // Private Maps — O(1) access by uid
    #nodes = new Map();   // uid → node
    #edges = new Map();   // uid → edge

    // Viewport dimensions needed for root-node centering in layout
    #viewport = { width: 800, height: 600 };

    // Graph-level default actions — UI layer reads these as fallback when a node
    // has no availableActions of its own. Stored opaquely; no semantic processing here.
    #defaultActions = [];

    // Graph-level default style config — UI layer reads as fallback when a node
    // has no availableStyleConfig of its own. Stored opaquely.
    #defaultStyleConfig = [];

    // Graph-level default context-menu actions — fallback when a node has no
    // contextMenuActions of its own. Stored opaquely; no semantic processing here.
    #defaultContextMenuActions = [];

    // Batching — defer events until a batch() block completes
    #batchDepth    = 0;
    #pendingEvents = new Map();   // event → latest payload marker

    // How many layout runs have been performed
    #renderCount = 0;

    constructor(options = {}) {
        super();
        if (options.viewport)          this.#viewport          = { ...options.viewport };
        if (options.defaultActions)    this.#defaultActions    = [...options.defaultActions];
        if (options.defaultStyleConfig) this.#defaultStyleConfig = [...options.defaultStyleConfig];
    }

    setDefaultActions(actions)         { this.#defaultActions     = actions; }
    getDefaultActions()                { return this.#defaultActions; }

    setDefaultStyleConfig(config)           { this.#defaultStyleConfig           = config; }
    getDefaultStyleConfig()                 { return this.#defaultStyleConfig; }

    setDefaultContextMenuActions(actions)   { this.#defaultContextMenuActions   = actions; }
    getDefaultContextMenuActions()          { return this.#defaultContextMenuActions; }

    /**
     * Resolve context-menu actions for a single node.
     * Uses per-node contextMenuActions if set, otherwise falls back to graph defaults.
     * Pure data — no DOM concern.
     *
     * @param {string} uid
     * @returns {object[]}
     */
    resolveContextMenuActions(uid) {
        const node = this.#nodes.get(uid);
        if (!node) return [];
        return node.contextMenuActions?.length
            ? node.contextMenuActions
            : this.#defaultContextMenuActions;
    }

    /**
     * Resolve the applicable action set for a given selection.
     * Merges per-node availableActions with graph defaults, deduplicates,
     * then filters by each action's applicability schema.
     * Pure data logic — no DOM or presentation concern.
     *
     * @param {string[]} selectedUids
     * @returns {object[]}  filtered, deduplicated action descriptors
     */
    resolveActionsForSelection(selectedUids) {
        const nodes = selectedUids.map(uid => this.#nodes.get(uid)).filter(Boolean);
        const count = nodes.length;
        if (!count) return [];

        const all = nodes.flatMap(n =>
            n.availableActions?.length ? n.availableActions : this.#defaultActions
        );

        const seen   = new Set();
        const unique = all.filter(a => {
            if (!a?.id || seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
        });

        return unique.filter(action => {
            const ap = action.applicability || {};
            if (count < (ap.minNodes ?? 1))        return false;
            if (count > (ap.maxNodes ?? Infinity))  return false;
            if (ap.nodeTypes?.length    && !nodes.every(n => ap.nodeTypes.includes(n.type)))      return false;
            if (ap.nodeVariants?.length && !nodes.every(n => ap.nodeVariants.includes(n.variant))) return false;
            return true;
        });
    }

    // ─── Viewport ─────────────────────────────────────────────────────────────

    setViewport(viewBox) {
        this.#viewport = { width: viewBox.width, height: viewBox.height };
    }

    getViewport() {
        return { ...this.#viewport };
    }

    // ─── Node CRUD ────────────────────────────────────────────────────────────

    /**
     * Add or upsert a node. Handles pubKey deduplication (server uid replacing
     * a temporary client-generated pubKey).
     *
     * @param {object} data  Raw node data from the application layer
     * @returns {object}     The stored node
     */
    addNode(data) {
        const typeCfg = getNodeTypeConfig(data.type);

        const node = {
            // Defaults
            type:           DEFAULT_NODE_TYPE,
            title:          '',
            content:        '',
            message:        '',
            status:         undefined,
            links:          [],
            tags:           [],
            styleClass:     typeCfg.style.nodeClass,
            // Pre-resolved render props — renderer reads these directly, no headless import needed.
            containerClass: typeCfg.style.containerClass,
            w:              typeCfg.layout.width,
            h:              typeCfg.layout.height,
            // variant — renderer extension point. Owned by the UI layer; stored opaquely here.
            variant:        undefined,
            // styles — per-node custom visual overrides. Plain object, UI layer interprets shape.
            styles:              undefined,
            // availableStyleConfig — overrides graph default style config for this node.
            // undefined = use graph-level default (set via store.setDefaultStyleConfig).
            availableStyleConfig: undefined,
            // showStylePanel — set to false to suppress the per-node style overlay.
            showStylePanel:      true,
            // contextMenuActions — per-node context menu actions.
            // undefined = use graph-level default (set via store.setDefaultContextMenuActions).
            contextMenuActions:  undefined,
            // Caller data (overrides defaults)
            ...data,
            // Normalised field aliases — must come after spread
            uid:     data.uid || randomUid(),
            content: data.content || data.msg || '',
            message: data.rawMsg  || data.message || '',
            // Layout state — always reset on add so layout recomputes cleanly
            _computedInitialProps: false,
        };

        // pubKey deduplication: a temp node rendered with pubKey as uid,
        // real uid now arrives — swap the map key while preserving position state.
        if (node.pubKey && !this.#nodes.has(node.uid)) {
            const existing = [...this.#nodes.values()].find(n => n.uid === node.pubKey);
            if (existing) {
                this.#nodes.delete(existing.uid);
                this.#nodes.set(node.uid, { ...existing, ...node, _computedInitialProps: false });
                this.#scheduleEvent('nodes:changed');
                return this.#nodes.get(node.uid);
            }
        }

        this.#nodes.set(node.uid, node);
        this.#scheduleEvent('nodes:changed');
        return node;
    }

    /**
     * Partially update a node's data fields.
     * Does not affect layout state unless _computedInitialProps is explicitly passed.
     */
    updateNode(uid, data) {
        const node = this.#nodes.get(uid);
        if (!node) return null;
        Object.assign(node, data);
        this.#scheduleEvent('nodes:changed');
        return node;
    }

    /**
     * Remove a node and all its connected edges.
     * Emits 'node:removed' BEFORE deletion so the rendering layer can animate out.
     * descendants in the payload are node objects (consistent with traversal API).
     */
    removeNode(uid) {
        if (!this.#nodes.has(uid)) return;
        const descendants = getDescendants(uid, this.#nodes);   // node[]
        this.emit('node:removed', { uid, descendants });

        this.#nodes.delete(uid);
        for (const [eid, edge] of this.#edges) {
            if (edge.srcUid === uid || edge.targetUid === uid) {
                this.#edges.delete(eid);
            }
        }

        this.#scheduleEvent('nodes:changed');
        this.#scheduleEvent('edges:changed');
    }

    getNode(uid)    { return this.#nodes.get(uid) ?? null; }
    getNodes()      { return [...this.#nodes.values()]; }
    hasNode(uid)    { return this.#nodes.has(uid); }
    get nodeCount() { return this.#nodes.size; }

    // ─── Edge CRUD ────────────────────────────────────────────────────────────

    /**
     * Add or update an edge between two nodes.
     * Deterministic uid matches the existing naming convention.
     */
    addEdge(data) {
        const edgeUid = data.type === 'placeholder'
            ? `placeholder-link-${data.srcUid}`
            : `${data.srcUid}-link-${data.targetUid}`;

        const existing = this.#edges.get(edgeUid);
        if (existing && !data.forceUpdate) return existing;

        const src = this.#nodes.get(data.srcUid);
        const tgt = this.#nodes.get(data.targetUid);
        if (!src || !tgt) {
            console.warn('[GraphStore] addEdge: node not found', data.srcUid, '->', data.targetUid);
            return null;
        }

        const srcPortId  = data.srcPortId    || getDefaultOutputPortId(src.type, getNodeTypeConfig);
        const tgtPortId  = data.targetPortId || getDefaultInputPortId(tgt.type,  getNodeTypeConfig);
        const edgeType   = data.type || 'default';

        const edge = {
            uid:          edgeUid,
            srcUid:       data.srcUid,
            targetUid:    data.targetUid,
            srcPortId,
            targetPortId: tgtPortId,
            type:         edgeType,
            // Pre-resolved render style — renderer reads this directly, no headless import needed.
            style:        getLinkTypeConfig(edgeType).style,
            path:         computeNodeLinkPath(src, tgt, getNodeTypeConfig, srcPortId, tgtPortId),
        };

        this.#edges.set(edge.uid, edge);
        this.#scheduleEvent('edges:changed');
        return edge;
    }

    removeEdge(uid) {
        if (!this.#edges.delete(uid)) return;
        this.#scheduleEvent('edges:changed');
    }

    getEdge(uid)  { return this.#edges.get(uid) ?? null; }
    getEdges()    { return [...this.#edges.values()]; }

    /**
     * Recompute the SVG path for a single edge (after one of its nodes moved).
     */
    refreshEdgePath(edgeUid) {
        const edge = this.#edges.get(edgeUid);
        if (!edge) return;
        const src = this.#nodes.get(edge.srcUid);
        const tgt = this.#nodes.get(edge.targetUid);
        if (src && tgt) {
            edge.path = computeNodeLinkPath(src, tgt, getNodeTypeConfig, edge.srcPortId, edge.targetPortId);
        }
        return edge;
    }

    /**
     * Recompute paths for all edges connected to a given node.
     * Called after a node is dragged or its position is otherwise updated.
     */
    refreshEdgePathsOfNode(nodeUid) {
        for (const edge of this.#edges.values()) {
            if (edge.srcUid === nodeUid || edge.targetUid === nodeUid) {
                this.refreshEdgePath(edge.uid);
            }
        }
        this.#scheduleEvent('edges:changed');
    }

    // ─── Node mutations with targeted events ──────────────────────────────────

    /**
     * Move a node to a new position and refresh its connected edge paths.
     * Emits targeted 'node:moved' instead of the broad 'nodes:changed'
     * so renderers can update just the moved node + its edges efficiently.
     *
     * @param {string} uid
     * @param {number} x    New x in SVG coordinate space
     * @param {number} y    New y in SVG coordinate space
     * @returns {object|null} The updated node
     */
    moveNode(uid, x, y) {
        const node = this.#nodes.get(uid);
        if (!node) return null;

        node.x      = x;
        node.y      = y;
        node.movedX = x;
        node.movedY = y;

        this.refreshEdgePathsOfNode(uid);

        this.emit('node:moved', { uid, x, y, node });
        return node;
    }

    /**
     * Update the status of a node (e.g. occurant running/done/error).
     * Emits narrow 'node:status-changed' so status indicators can update
     * without triggering a full node re-render.
     *
     * @param {string} uid
     * @param {string} status
     */
    setNodeStatus(uid, status) {
        const node = this.#nodes.get(uid);
        if (!node) return;
        node.status = status;
        this.emit('node:status-changed', { uid, status, node });
    }

    // ─── Layout ───────────────────────────────────────────────────────────────

    /**
     * Compute positions for all nodes and refresh all edge paths.
     * Emits 'layout:computed' with the full { nodes, edges } snapshot.
     *
     * Note: does NOT reset _computedInitialProps on already-placed nodes —
     * dragged nodes keep their user-adjusted positions across layout runs.
     * To force a full recompute, set _computedInitialProps = false on the
     * relevant nodes first.
     *
     * @param {object} [options]
     * @param {number} [options.paginationThreshold]
     */
    computeLayout(options = {}) {
        runHorizontalLayout(this.#nodes, this.#viewport, {
            ...options,
            renderCount: this.#renderCount,
        });

        for (const edge of this.#edges.values()) {
            this.refreshEdgePath(edge.uid);
        }

        this.#renderCount++;

        this.emit('layout:computed', {
            nodes: this.getNodes(),
            edges: this.getEdges(),
        });
    }

    // ─── Bulk ingestion ───────────────────────────────────────────────────────

    /**
     * Ingest a batch of raw node data, build edges from node.links,
     * compute layout, and emit a single set of events.
     *
     * Edge rebuilding is scoped to newly added nodes and any existing nodes
     * whose target just became resolvable (handles out-of-order arrival).
     *
     * @param {object[]} nodesData
     * @param {object}   [options]
     */
    ingest(nodesData, options = {}) {
        const newUids = new Set();

        this.batch(() => {
            nodesData.forEach(data => {
                const node = this.addNode(data);
                newUids.add(node.uid);
            });

            // Rebuild edges for:
            // 1. Newly added/updated nodes (their links may now be resolvable)
            // 2. Existing nodes that link to a newly arrived target (out-of-order)
            for (const node of this.#nodes.values()) {
                const isNew = newUids.has(node.uid);
                const hasNewTarget = node.links?.some(l => l.targetUid && newUids.has(l.targetUid));
                if (!isNew && !hasNewTarget) continue;

                (node.links || []).forEach(link => {
                    if (link.targetUid && this.#nodes.has(link.targetUid)) {
                        this.addEdge({ srcUid: node.uid, targetUid: link.targetUid, type: link.type });
                    }
                });
            }
        });

        this.computeLayout(options);
    }

    /**
     * Update specific fields across multiple nodes without triggering layout.
     * Use for content, style, or tag updates from the server.
     *
     * @param {object[]} updates  Array of partial node data objects (must include uid)
     * @param {'content'|'style'|'tags'} field
     */
    updateNodesBatch(updates, field) {
        this.batch(() => {
            updates.forEach(update => {
                const node = this.#nodes.get(update.uid);
                if (!node) return;

                if (field === 'content') {
                    node.content = update.content || update.msg || '';
                    node.title   = update.title   || node.title  || '';
                    node.message = update.rawMsg   || update.message || node.message || '';
                } else if (field === 'style') {
                    if (update.styleObj)   node.styleObj   = update.styleObj;
                    if (update.styleClass) node.styleClass = update.styleClass;
                } else if (field === 'tags') {
                    node.tags = update.tags ?? node.tags;
                }
            });
        });
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Tear down the store — clear all state and remove all event listeners.
     * Call from the component's onDisconnect to prevent memory leaks.
     */
    destroy() {
        this.#nodes.clear();
        this.#edges.clear();
        this.#pendingEvents.clear();
        this.#batchDepth  = 0;
        this.#renderCount = 0;
        this.clear();   // EventBus: removes all listeners
    }

    // ─── Traversal (delegated to graph-traversal.js) ──────────────────────────
    // All methods return node[] or edge[] for consistency.

    getChildren(uid)             { return getChildren(uid, this.#nodes); }
    getDescendants(uid)          { return getDescendants(uid, this.#nodes); }
    getParents(uid)              { return getParents(uid, this.#nodes); }
    getAncestors(uid)            { return getAncestors(uid, this.#nodes); }
    getRoots()                   { return getRoots(this.#nodes); }
    getEdgesOfNode(uid)          { return getEdgesOfNode(uid, this.#edges); }
    getOutgoingEdges(uid)        { return getOutgoingEdges(uid, this.#edges); }
    getIncomingEdges(uid)        { return getIncomingEdges(uid, this.#edges); }
    findCommonParent(uidA, uidB) { return findCommonParent(uidA, uidB, this.#nodes); }
    getDepth(uid)                { return getDepth(uid, this.#nodes); }

    getNodesAroundPoint(x, y, xThreshold, yThreshold, excludeUids = []) {
        return getNodesAroundPoint(x, y, this.getNodes(), xThreshold, yThreshold, excludeUids);
    }

    // ─── Batching ─────────────────────────────────────────────────────────────

    /**
     * Execute fn() without emitting events until the block completes.
     * Nested batch() calls are supported — events flush only when the
     * outermost block finishes.
     */
    batch(fn) {
        this.#batchDepth++;
        try {
            fn();
        } finally {
            this.#batchDepth--;
            if (this.#batchDepth === 0) this.#flushEvents();
        }
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #scheduleEvent(event) {
        this.#pendingEvents.set(event, true);
        if (this.#batchDepth === 0) this.#flushEvents();
    }

    #flushEvents() {
        const events = [...this.#pendingEvents.keys()];
        this.#pendingEvents.clear();
        for (const event of events) {
            const payload = event === 'nodes:changed'
                ? { nodes: this.getNodes() }
                : { edges: this.getEdges() };
            this.emit(event, payload);
        }
    }
}
