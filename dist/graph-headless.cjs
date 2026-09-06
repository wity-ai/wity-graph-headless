'use strict';

/**
 * EventBus — typed pub/sub event system.
 * Foundation for all inter-layer communication in the graph engine.
 * Framework-agnostic, zero dependencies.
 */
class EventBus {
    #handlers = new Map();

    /**
     * Subscribe to an event.
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} unsubscribe function
     */
    on(event, handler) {
        if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
        this.#handlers.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        this.#handlers.get(event)?.delete(handler);
    }

    /**
     * Subscribe to an event once.
     * @returns {Function} unsubscribe function
     */
    once(event, handler) {
        const unsub = this.on(event, (payload) => {
            handler(payload);
            unsub();
        });
        return unsub;
    }

    /**
     * Emit an event with payload.
     * Wildcard listeners subscribed to '*' receive { event, payload }.
     */
    emit(event, payload) {
        this.#handlers.get(event)?.forEach(h => h(payload));
        this.#handlers.get('*')?.forEach(h => h({ event, payload }));
    }

    /**
     * Remove all listeners for an event, or all listeners if no event given.
     */
    clear(event) {
        if (event) {
            this.#handlers.delete(event);
        } else {
            this.#handlers.clear();
        }
    }
}

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
function getChildren(parentUid, nodes) {
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
function getDescendants(rootUid, nodes) {
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
function getParents(nodeUid, nodes) {
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
function getAncestors(nodeUid, nodes) {
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
function getRoots(nodes) {
    return [...nodes.values()].filter(node => !node.links?.length);
}

/**
 * Returns all edges connected to a node (as source or target).
 *
 * @param {string} nodeUid
 * @param {Map}    edges    Map<uid, edge>
 * @returns {object[]} edge[]
 */
function getEdgesOfNode(nodeUid, edges) {
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
function getOutgoingEdges(nodeUid, edges) {
    return [...edges.values()].filter(edge => edge.srcUid === nodeUid);
}

/**
 * Returns edges where nodeUid is the target.
 *
 * @param {string} nodeUid
 * @param {Map}    edges
 * @returns {object[]} edge[]
 */
function getIncomingEdges(nodeUid, edges) {
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
function findCommonParent(uidA, uidB, nodes) {
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
function getDepth(nodeUid, nodes) {
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


class GraphAbstract extends EventBus {
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

/**
 * Node type ontology — grounded in Basic Formal Ontology (BFO) terminology.
 *
 * Continuant:   An entity that persists through time — a thought, concept, or idea.
 *               Exists independently and retains identity across time.
 *
 * Occurant:     A process or event — a brainstorming session, thought expansion,
 *               or agentic action. Unfolds over time rather than persisting through it.
 *
 * Placeholder:  A prospective node indicating potential thought connections.
 *               Ephemeral by nature — becomes a continuant or occurant when committed.
 *
 * Port model:
 *   Each node type declares named ports — the attachment points where edges connect.
 *   Ports have:
 *     id        — unique within the node type ('in', 'out', 'image', etc.)
 *     side      — 'input' (left) or 'output' (right)
 *     yFraction — vertical position as a fraction of node height (0 = top, 1 = bottom)
 *     xOffset   — pixel inset from the node edge (default 0 = exactly on border)
 *
 *   getPortSvgPos() in port-geometry.js converts these to absolute SVG coordinates.
 *   The magic-offset fields (linkXOffset, linkYOffset, containerLMargin,
 *   containerRMargin) have been replaced by ports — values are identical.
 */

const NODE_TYPES = {
    continuant: {
        label:       'Continuant',
        description: 'A persisting entity — thought, concept, or idea node',
        layout: {
            xSpacing: 320,
            ySpacing: 150,
            width:    240,   // px
            height:   272,   // px
        },
        ports: {
            // yFraction: 120/272 ≈ 0.44  →  y = 120px  (vertically centered on node face)
            // xOffset 0 on both sides  →  dot sits exactly on the node border
            inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.44, xOffset: 0, style: { color: '#6b7280', radius: 6 } }],
            outputs: [{ id: 'out', side: 'output', yFraction: 0.44, xOffset: 0, style: { color: '#6b7280', radius: 6 } }],
        },
        style: {
            containerClass: 'p-3 overflow-visible relative',
            nodeClass:      'default-node-vector color-primary',
            widthCss:       '15em',
            heightCss:      '17em',
        },
    },

    occurant: {
        label:       'Occurant',
        description: 'A process or event — thought expansion, brainstorm session',
        layout: {
            xSpacing: 320,
            ySpacing: 150,
            width:    240,
            height:   136,
        },
        ports: {
            // yFraction: 60/136 ≈ 0.44  →  y = 60px  (vertically centered on node face)
            inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.44, xOffset: 0, style: { color: '#f97316', radius: 5 } }],
            outputs: [{ id: 'out', side: 'output', yFraction: 0.44, xOffset: 0, style: { color: '#f97316', radius: 5 } }],
        },
        style: {
            containerClass: 'p-3 overflow-visible relative',
            nodeClass:      'default-node-vector color-secondary',
            widthCss:       '15em',
            heightCss:      '8.5em',
        },
    },

    placeholder: {
        label:       'Placeholder',
        description: 'A prospective node — marks potential thought connections during drag-to-link',
        layout: {
            xSpacing: 0,
            ySpacing: 0,
            width:    2,
            height:   2,
        },
        ports: {
            inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.5, xOffset: 0, style: { color: 'transparent', radius: 0 } }],
            outputs: [{ id: 'out', side: 'output', yFraction: 0.5, xOffset: 0, style: { color: 'transparent', radius: 0 } }],
        },
        style: {
            containerClass: 'p-3 overflow-visible relative',
            nodeClass:      'default-node-vector color-secondary',
            widthCss:       '15em',
            heightCss:      '17em',
        },
    },
};

const DEFAULT_NODE_TYPE = 'continuant';

/**
 * Returns the config for a node type, falling back to continuant if unknown.
 */
function getNodeTypeConfig(type) {
    return NODE_TYPES[type] ?? NODE_TYPES[DEFAULT_NODE_TYPE];
}

/**
 * Returns the dataSchema for a node type, or null if none is defined.
 * @param {string} type
 * @returns {object|null}
 */
function getDataSchema(type) {
    return NODE_TYPES[type]?.dataSchema ?? null;
}

/**
 * Register a custom node type at runtime.
 * Enables extending the ontology without modifying this file.
 *
 * @example
 * registerNodeType('goal', {
 *   label: 'Goal',
 *   layout: { xSpacing: 320, ySpacing: 150, width: 240, height: 272 },
 *   ports: {
 *     inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.5, xOffset: 0 }],
 *     outputs: [{ id: 'out', side: 'output', yFraction: 0.5, xOffset: 0 }],
 *   },
 *   style: { nodeClass: 'goal-node', widthCss: '15em', heightCss: '17em' },
 *   dataSchema: {                     // optional — typed properties for node.data
 *     priority: { type: 'number' },
 *     status:   { type: 'enum', values: ['draft', 'active', 'met'] },
 *   },
 * })
 */
function registerNodeType(name, config) {
    if (NODE_TYPES[name]) {
        console.warn(`[NodeTypes] Overwriting existing node type: "${name}"`);
    }
    NODE_TYPES[name] = {
        ...config,
        style: {
            nodeClass:      '',
            containerClass: '',
            ...config.style,
        },
        dataSchema: config.dataSchema ?? undefined,
    };
}

/**
 * Partially update a built-in or registered node type.
 * Deep-merges one level per structural key — only the fields you provide change;
 * everything else (ports, spacing, style classes, etc.) stays untouched.
 *
 * Call at app initialisation, BEFORE any nodes of that type are added to the
 * store. Layout spacing and hit-testing use node.w / node.h which are stamped
 * at addNode() time — patching after nodes exist leaves those cached values
 * stale until the next computeLayout() + node recreation.
 *
 * @example
 * patchNodeType('occurant', {
 *   layout: { height: 100 },
 *   style:  { heightCss: '6.25em' },
 * });
 *
 * @param {string} name   Existing type name ('continuant', 'occurant', or custom)
 * @param {object} patch  Partial config — only the keys you want to change
 */
function patchNodeType(name, patch) {
    const existing = NODE_TYPES[name];
    if (!existing) {
        console.warn(`[NodeTypes] patchNodeType: unknown type "${name}". Use registerNodeType to define new types.`);
        return;
    }
    NODE_TYPES[name] = {
        ...existing,
        ...patch,
        layout: { ...existing.layout, ...(patch.layout ?? {}) },
        ports: {
            inputs:  patch.ports?.inputs  ?? existing.ports.inputs,
            outputs: patch.ports?.outputs ?? existing.ports.outputs,
        },
        style: { ...existing.style, ...(patch.style ?? {}) },
        dataSchema: patch.dataSchema !== undefined ? patch.dataSchema : existing.dataSchema,
    };
}

/**
 * Spatial utilities — headless collision detection and proximity queries.
 *
 * Uses stored {x, y, w, h} pixel values — no DOM getBBox() required.
 * All functions are pure math and stateless.
 */

/**
 * Returns true if two axis-aligned rectangles overlap.
 *
 * @param {{ x, y, w, h }} a
 * @param {{ x, y, w, h }} b
 */
function rectsOverlap(a, b) {
    return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    );
}

/**
 * Returns all nodes that spatially overlap with the given node.
 *
 * @param {object}   node      Node with { uid, x, y, w, h }
 * @param {object[]} allNodes
 * @returns {object[]}
 */
function getOverlappingNodes(node, allNodes) {
    return allNodes.filter(other => {
        if (other.uid === node.uid) return false;
        return rectsOverlap(
            { x: node.x,  y: node.y,  w: node.w,  h: node.h },
            { x: other.x, y: other.y, w: other.w, h: other.h }
        );
    });
}

/**
 * Adjusts a node's position until it no longer overlaps with others.
 * Alternates shifting down/up (countType) while always shifting right.
 *
 * The offsetH and offsetW parameters must be derived from the node's type
 * config (layout.height and layout.width + margins) by the caller, so this
 * function stays dimension-agnostic.
 *
 * @param {object}       node       Mutated in place
 * @param {object[]}     allNodes   Other nodes to test against
 * @param {'odd'|'even'} countType  Internal direction toggle
 * @param {number}       depth      Recursion depth guard
 * @param {number}       offsetH    Vertical shift per step (px) — from type config
 * @param {number}       offsetW    Horizontal shift per step (px) — from type config
 */
function resolveOverlaps(
    node,
    allNodes,
    countType = 'odd',
    depth     = 0,
    offsetH   = 272,   // fallback: continuant height
    offsetW   = 270,   // fallback: continuant width + margins
) {
    if (depth > 10) return;

    node.y += countType === 'odd' ? 2 * offsetH : -(2 * offsetH);
    node.x += 2 * offsetW;

    const remaining = getOverlappingNodes(node, allNodes);
    if (remaining.length > 0) {
        resolveOverlaps(
            node,
            allNodes,
            countType === 'odd' ? 'even' : 'odd',
            depth + 1,
            offsetH,
            offsetW,
        );
    }
}

/**
 * Returns nodes within a given spatial proximity of a point.
 * Used for drag-to-link snap-target detection.
 *
 * @param {number}   x
 * @param {number}   y
 * @param {object[]} nodes
 * @param {number}   xThreshold
 * @param {number}   yThreshold
 * @param {string[]} excludeUids
 * @returns {object[]}
 */
function getNodesAroundPoint(x, y, nodes, xThreshold, yThreshold, excludeUids = []) {
    return nodes.filter(node => {
        if (excludeUids.includes(node.uid)) return false;
        return Math.abs(node.x - x) < xThreshold && Math.abs(node.y - y) < yThreshold;
    });
}

/**
 * Horizontal Tree Layout
 *
 * Exact extraction of the layout algorithm from directed-graph/index.js.
 * Visual output is identical to the existing component — no positional changes.
 *
 * Algorithm:
 *   - Root node (no links) is centered in the viewport
 *   - Children expand to the right at fixed X_SPACING increments
 *   - Siblings are distributed alternating above/below their parent's Y:
 *       sibling 1 → parent.y + 1*Y_SPACING
 *       sibling 2 → parent.y - 1*Y_SPACING
 *       sibling 3 → parent.y + 2*Y_SPACING
 *       sibling 4 → parent.y - 2*Y_SPACING  ... etc.
 *   - Nodes that overlap after placement are shifted right + alternating up/down
 *
 * Pure math — no DOM, no D3, no rendering concerns.
 */


/**
 * Computes the anchor (parent position) for a node.
 * If the node has no links it is a root — centred in the viewport.
 *
 * @param {object}  node
 * @param {Map}     nodes      Map<uid, node>
 * @param {object}  cfg        Node type layout config
 * @param {object}  viewBox    { width, height }
 * @returns {{ x, y, abscissaIdx, linkedNode: node|null } | null}
 */
function computeAnchor(node, nodes, cfg, viewBox) {
    const links = node.links || [];

    if (!links.length) {
        // Root: place at viewport center, offset by one spacing unit
        return {
            x: (viewBox.width  / 2) - cfg.layout.xSpacing - cfg.layout.width  / 2,
            y: (viewBox.height / 2) - cfg.layout.ySpacing - cfg.layout.height / 2,
            abscissaIdx: 0,
            linkedNode: null,
        };
    }

    const parentUid = links[0].targetUid;
    const parent = nodes.get(parentUid);
    if (!parent) return null;

    // Ensure parent position is computed before child
    if (!parent._computedInitialProps) {
        const parentIdx = [...nodes.keys()].indexOf(parentUid);
        computeNodePosition(parent, parentIdx, nodes, viewBox);
    }

    return {
        x: parent.x,
        y: parent.y,
        abscissaIdx: parent.abscissaIdx ?? 0,
        linkedNode: parent,
    };
}

/**
 * Computes layout props {x, y, w, h, abscissaIdx, ordinateIdx, visibility}
 * for a single node. Mutates the node in place — matching existing behaviour.
 * Idempotent: skips already-computed nodes unless forceRecompute is set.
 *
 * @param {object} node
 * @param {number} nodeIdx       Index in insertion order
 * @param {Map}    nodes         Map<uid, node> — full graph
 * @param {object} viewBox       { width, height }
 * @param {object} [options]
 * @param {number} [options.paginationThreshold=Infinity]
 * @param {number} [options.renderCount=0]
 */
function computeNodePosition(node, nodeIdx, nodes, viewBox, options = {}) {
    if (node._computedInitialProps === true) return node;

    const { paginationThreshold = Infinity, renderCount = 0 } = options;

    try {
        const cfg      = getNodeTypeConfig(node.type);
        const nodesArr = [...nodes.values()];

        let x, y, defaultVisibility;

        if (node.anchor) {
            x = node.anchor.x;
            y = node.anchor.y;
            defaultVisibility = 'visible';
        } else {
            const anchor = computeAnchor(node, nodes, cfg, viewBox);
            if (!anchor) return node;

            x = anchor.x + cfg.layout.xSpacing;

            const siblings = anchor.linkedNode
                ? nodesArr.filter(n => n.links?.some(l => l.targetUid === anchor.linkedNode.uid))
                : [];
            const siblingIdx = siblings.findIndex(s => s.uid === node.uid) + 1;

            const rootNode    = nodesArr[0];
            const abscissaIdx = Math.round(
                Math.abs(rootNode?.x != null ? x - rootNode.x : 0) / cfg.layout.xSpacing
            );
            const ordinateIdx = nodesArr.filter(n => n.abscissaIdx === abscissaIdx).length;

            node.abscissaIdx = abscissaIdx;
            node.ordinateIdx = ordinateIdx;

            const parentY = anchor.linkedNode?.y ?? anchor.y;

            if (renderCount > 1) {
                y = siblingIdx === 0
                    ? parentY
                    : siblingIdx % 2
                        ? parentY + Math.ceil(siblingIdx * cfg.layout.ySpacing)
                        : parentY - Math.ceil(siblingIdx * cfg.layout.ySpacing);
            } else {
                y = siblingIdx === 0
                    ? anchor.y
                    : siblingIdx % 2
                        ? parentY + Math.ceil(siblingIdx * cfg.layout.ySpacing)
                        : parentY - Math.ceil(siblingIdx * cfg.layout.ySpacing);
            }

            defaultVisibility = siblingIdx >= paginationThreshold ? 'hidden' : 'visible';
        }

        node.idx        = nodeIdx;
        node.x          = x;
        node.y          = y;
        node._x         = x;
        node._y         = y;
        node.w          = cfg.layout.width;
        node.h          = cfg.layout.height;
        node.visibility = defaultVisibility;
        node._computedInitialProps = true;

        // Resolve overlaps using this node's type dimensions
        const placed   = nodesArr.filter(n => n._computedInitialProps && n.uid !== node.uid);
        const overlaps = getOverlappingNodes(node, placed);
        if (overlaps.length > 0) {
            // Overlap width = node width + combined horizontal port insets (input xOffset + output xOffset)
            // These were previously containerLMargin + containerRMargin (25 + 5 = 30).
            const inputXOffset  = cfg.ports?.inputs?.[0]?.xOffset  ?? 0;
            const outputXOffset = cfg.ports?.outputs?.[0]?.xOffset ?? 0;
            const offsetW = cfg.layout.width + inputXOffset + outputXOffset;
            resolveOverlaps(node, placed, 'odd', 0, cfg.layout.height, offsetW);
        }
    } catch (e) {
        console.error('[HorizontalTreeLayout] Failed to compute position for node', node.uid, e);
    }

    return node;
}

/**
 * Computes positions for all nodes in the graph.
 * Processes nodes in Map insertion order so parents are computed before children.
 *
 * @param {Map}    nodes    Map<uid, node> — mutated in place
 * @param {object} viewBox  { width, height }
 * @param {object} options  Passed through to computeNodePosition
 */
function computeLayout(nodes, viewBox, options = {}) {
    let idx = 0;
    for (const node of nodes.values()) {
        computeNodePosition(node, idx++, nodes, viewBox, options);
    }
    return nodes;
}

/**
 * Port geometry — pure math, no DOM, no D3.
 *
 * Converts a node's position + its type's port declarations into
 * absolute SVG coordinates. The UI layer uses these to:
 *   - Draw connector dots at the right spot on the node border
 *   - Compute edge start/end points for bezier paths
 *   - Determine drop targets during drag-to-connect
 */

/**
 * Absolute SVG position of a named port on a node.
 *
 * Port coordinates are relative to the node's top-left corner:
 *   - Input ports:  x = xOffset from left edge
 *   - Output ports: x = width - xOffset from right edge
 *   - y            = yFraction * height
 *
 * @param {object}   node      Node with { x, y, movedX?, movedY?, type }
 * @param {string}   portId    Port id declared in node type config ('in', 'out', etc.)
 * @param {Function} getConfig (type) => nodeTypeConfig
 * @returns {{ x: number, y: number } | null}
 */
function getPortSvgPos(node, portId, getConfig) {
    const cfg  = getConfig(node.type);
    const port = _findPort(cfg, portId);
    if (!port) return null;

    const nx = node.movedX ?? node.x ?? 0;
    const ny = node.movedY ?? node.y ?? 0;
    // Per-node w/h override type config — lets callers pass custom dimensions on
    // the node data (e.g. media nodes) without registering a separate node type.
    const width  = node.w ?? cfg.layout.width;
    const height = node.h ?? cfg.layout.height;

    const x = port.side === 'output'
        ? nx + width  - (port.xOffset ?? 0)
        : nx          + (port.xOffset ?? 0);
    const y = ny + port.yFraction * height;

    return { x, y };
}

/**
 * All port SVG positions for a node, keyed for renderer use.
 *
 * @param {object}   node
 * @param {Function} getConfig
 * @returns {Array<{ nodeUid, portId, side, x, y }>}
 */
function getPortDots(node, getConfig) {
    const cfg  = getConfig(node.type);
    const all  = [...(cfg.ports?.inputs || []), ...(cfg.ports?.outputs || [])];
    return all.map(port => {
        const pos = getPortSvgPos(node, port.id, getConfig);
        return {
            nodeUid: node.uid,
            portId:  port.id,
            side:    port.side,
            style:   port.style ?? { color: '#6b7280', radius: 6 },
            ...pos,
        };
    });
}

/**
 * Active input ports for a node — base ports from its type, plus one extra
 * empty slot if all declared inputs are already connected (dynamic multi-input).
 *
 * @param {object}   node
 * @param {object[]} allEdges   All edges in the graph
 * @param {Function} getConfig
 * @returns {object[]}          Port config objects
 */
function getActiveInputPorts(node, allEdges, getConfig) {
    const cfg        = getConfig(node.type);
    const basePorts  = cfg.ports?.inputs || [];
    const connected  = allEdges.filter(e => e.targetUid === node.uid).map(e => e.targetPortId);
    const allOccupied = basePorts.every(p => connected.includes(p.id));

    if (!allOccupied || !basePorts.length) return basePorts;

    // All declared inputs are taken — append a dynamic overflow port.
    const idx       = connected.length;
    const basePort  = basePorts[basePorts.length - 1];
    const overflowY = Math.min(basePort.yFraction + 0.15 * idx, 0.95);

    return [
        ...basePorts,
        { id: `in-${idx}`, side: 'input', yFraction: overflowY, xOffset: basePort.xOffset ?? 0 },
    ];
}

/**
 * Returns the default output port id for a node type.
 * Used when creating edges without explicit port ids.
 */
function getDefaultOutputPortId(type, getConfig) {
    const outputs = getConfig(type).ports?.outputs || [];
    return outputs[0]?.id ?? 'out';
}

/**
 * Returns the default input port id for a node type.
 */
function getDefaultInputPortId(type, getConfig) {
    const inputs = getConfig(type).ports?.inputs || [];
    return inputs[0]?.id ?? 'in';
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _findPort(cfg, portId) {
    const all = [...(cfg.ports?.inputs || []), ...(cfg.ports?.outputs || [])];
    return all.find(p => p.id === portId) ?? null;
}

/**
 * Link path geometry — pure math, no D3 dependency.
 *
 * Produces cubic bezier SVG paths identical to d3.linkHorizontal().
 * Self-contained so the headless layer has no D3 import.
 */


/**
 * Cubic bezier path between two absolute SVG points.
 * Output is identical to d3.linkHorizontal()({ source, target }).
 *
 * @param {[number, number]} source  [x, y]
 * @param {[number, number]} target  [x, y]
 * @returns {string} SVG path `d` attribute
 */
function horizontalLinkPath(source, target) {
    const mx = (source[0] + target[0]) / 2;
    return `M${source[0]},${source[1]}C${mx},${source[1]} ${mx},${target[1]} ${target[0]},${target[1]}`;
}

/**
 * Compute the SVG path between two nodes using their port positions.
 *
 * @param {object}   srcNode      Node with { x, y, movedX?, movedY?, type }
 * @param {object}   targetNode   Node with { x, y, movedX?, movedY?, type }
 * @param {Function} getConfig    (type) => nodeTypeConfig
 * @param {string}   [srcPortId]  Defaults to first output port ('out')
 * @param {string}   [tgtPortId]  Defaults to first input port ('in')
 * @returns {string} SVG path `d` attribute
 */
function computeNodeLinkPath(srcNode, targetNode, getConfig, srcPortId = 'out', tgtPortId = 'in') {
    const src = getPortSvgPos(srcNode, srcPortId, getConfig);
    const tgt = getPortSvgPos(targetNode, tgtPortId, getConfig);

    // Fallback if port ids not found in config — should not happen in practice
    if (!src || !tgt) {
        console.warn('[LinkPath] Port not found:', srcPortId, tgtPortId, srcNode.type, targetNode.type);
        const sx = (srcNode.movedX ?? srcNode.x ?? 0);
        const sy = (srcNode.movedY ?? srcNode.y ?? 0);
        const tx = (targetNode.movedX ?? targetNode.x ?? 0);
        const ty = (targetNode.movedY ?? targetNode.y ?? 0);
        return horizontalLinkPath([sx, sy], [tx, ty]);
    }

    // Always render left-to-right visually.
    // When the logical source is to the right of the target (e.g. child→parent in
    // a horizontal tree), swap which node each portId is applied to — srcPortId ('out')
    // goes to the visually-left node, tgtPortId ('in') to the visually-right node.
    // Swapping just the coordinates (without re-fetching ports) would anchor the path
    // to the wrong dots when nodes differ in height.
    if (src.x > tgt.x) {
        const vSrc = getPortSvgPos(targetNode, srcPortId, getConfig);
        const vTgt = getPortSvgPos(srcNode,    tgtPortId, getConfig);
        if (vSrc && vTgt) {
            return horizontalLinkPath([vSrc.x, vSrc.y], [vTgt.x, vTgt.y]);
        }
    }

    return horizontalLinkPath([src.x, src.y], [tgt.x, tgt.y]);
}

/**
 * Link type ontology.
 *
 * default:     A directed relationship between two nodes. The fundamental
 *              connection in a brainstorming graph — idea leads to idea.
 *
 * placeholder: A tentative link rendered during drag-to-link interaction.
 *              Ephemeral — becomes default if the drag completes, removed if cancelled.
 *
 * semantic:    An explicitly typed conceptual relationship (e.g. "supports",
 *              "contradicts", "derives-from"). Reserved for future rich-linking.
 */

const LINK_TYPES = {
    default: {
        label: 'Default',
        description: 'Standard directed connection between nodes',
        style: { stroke: 'darkgray', strokeWidth: '2px', dashArray: null },
    },

    placeholder: {
        label: 'Placeholder',
        description: 'Tentative link shown during drag-to-link interaction',
        style: { stroke: 'darkgray', strokeWidth: '2px', dashArray: '4 4' },
    },

    semantic: {
        label: 'Semantic',
        description: 'Explicitly typed conceptual relationship between nodes',
        style: { stroke: '#6366f1', strokeWidth: '2px', dashArray: null },
    },
};

const DEFAULT_LINK_TYPE = 'default';

function getLinkTypeConfig(type) {
    return LINK_TYPES[type] ?? LINK_TYPES.default;
}

/**
 * Register a custom link type at runtime.
 */
function registerLinkType(name, config) {
    LINK_TYPES[name] = config;
}

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
 *   'node:style-changed'  { uid, styleObj, node }      — after setNodeStyle()
 *   'node:data-changed'   { uid, data, node }          — after setNodeData() (shallow merge)
 *   'node:removed'        { uid, descendants: node[] } — before single-node removal
 *   'nodes:removed'       { uids, nodes: node[] }      — before bulk removal (removeNodes)
 *   'objects:changed'     { objects: object[] }        — after addObject() / removeObject()
 *   'object:moved'        { uid, x, y, offset, object } — after moveObject() or when anchor node moves
 */


function randomUid() {
    return Math.random().toString(36).slice(2, 8);
}

class GraphStore extends EventBus {
    // Private Maps — O(1) access by uid
    #nodes     = new Map();   // uid → node
    #edges     = new Map();   // uid → edge
    #adjacency = new Map();   // nodeUid → Set<edgeUid> — keeps refreshEdgePathsOfNode O(degree)
    #objects        = new Map();   // uid → object
    #objectsByAnchor = new Map();  // nodeUid → Set<objectUid> — O(1) lookup on node move

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
            // styleObj — per-node custom visual overrides. Plain object, UI layer interprets shape.
            // Write via setNodeStyle(uid, styleObj); read via getNodeStyle(uid) or node.styleObj.
            styleObj:            undefined,
            // availableStyleConfig — overrides graph default style config for this node.
            // undefined = use graph-level default (set via store.setDefaultStyleConfig).
            availableStyleConfig: undefined,
            // showStylePanel — set to false to suppress the per-node style overlay.
            showStylePanel:      true,
            // contextMenuActions — per-node context menu actions.
            // undefined = use graph-level default (set via store.setDefaultContextMenuActions).
            contextMenuActions:  undefined,
            // ─── Actor attribution ───────────────────────────────────────────
            // Carried opaquely — no semantic processing in the headless layer.
            // Use ActorRegistry to resolve actorId strings to display metadata.
            //
            // createdBy  {string}    — actorId of the actor who created this node.
            //                          Single value; immutable once set by the caller.
            // updatedBy  {string[]}  — actorIds of all actors who have modified this node.
            //                          Treated as a contributors list (append-only by convention).
            //                          Does not preserve temporal order or frequency —
            //                          use SessionLog for the full per-actor audit trail.
            createdBy:  undefined,
            updatedBy:  undefined,
            // Layout state default — caller can override by passing _computedInitialProps: true
            // alongside explicit x, y to pin the node at a specific position.
            _computedInitialProps: false,
            // Caller data (overrides all defaults above, including _computedInitialProps)
            ...data,
            // Normalised field aliases — must come after spread
            uid:     data.uid || randomUid(),
            content: data.content || data.msg || '',
            message: data.rawMsg  || data.message || '',
        };

        // pubKey deduplication: a temp node rendered with pubKey as uid,
        // real uid now arrives — swap the map key while preserving position state.
        if (node.pubKey && !this.#nodes.has(node.uid)) {
            const existing = [...this.#nodes.values()].find(n => n.uid === node.pubKey);
            if (existing) {
                this.#nodes.delete(existing.uid);
                this.#nodes.set(node.uid, { ...existing, ...node });
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
        const descendants = getDescendants(uid, this.#nodes);
        this.emit('node:removed', { uid, descendants });
        this.#deleteNode(uid);
        this.#scheduleEvent('nodes:changed');
        this.#scheduleEvent('edges:changed');
    }

    /**
     * Remove multiple nodes and all their connected edges in a single batch.
     * Prefer this over calling removeNode() in a loop — emits one 'nodes:removed'
     * event before deletion and coalesces 'nodes:changed' + 'edges:changed' into
     * single emissions regardless of how many nodes are removed.
     *
     * The caller is responsible for passing the full set of uids to remove
     * (including descendants if desired — use store.getDescendants() to build the list).
     *
     * @param {string[]} uids
     * @example
     * // Delete a branch
     * const descendants = store.getDescendants(uid);
     * store.removeNodes([uid, ...descendants.map(d => d.uid)]);
     */
    removeNodes(uids) {
        const toRemove = uids.filter(uid => this.#nodes.has(uid));
        if (!toRemove.length) return;

        const nodes = toRemove.map(uid => this.#nodes.get(uid));

        // Emit once before any deletion — presentation layer animates all exits together
        this.emit('nodes:removed', { uids: toRemove, nodes });

        this.batch(() => {
            for (const uid of toRemove) {
                if (!this.#nodes.has(uid)) continue;
                this.#deleteNode(uid);
                this.#scheduleEvent('nodes:changed');
                this.#scheduleEvent('edges:changed');
            }
        });
    }

    /**
     * Returns a direct reference to the internal node object — NOT a copy.
     * Read-only use is safe. Any mutation MUST go through updateNode() to
     * trigger events; direct property assignment silently bypasses listeners.
     */
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
            // ─── Actor attribution ───────────────────────────────────────────
            // Carried opaquely — same conventions as on nodes.
            // createdBy  {string}    — actorId who created this edge
            // updatedBy  {string[]}  — actorIds who have modified this edge
            createdBy: data.createdBy,
            updatedBy: data.updatedBy,
        };

        this.#edges.set(edge.uid, edge);
        this.#adjacencyAdd(edge.srcUid,    edge.uid);
        this.#adjacencyAdd(edge.targetUid, edge.uid);
        this.#scheduleEvent('edges:changed');
        return edge;
    }

    removeEdge(uid) {
        const edge = this.#edges.get(uid);
        if (!edge) return;
        this.#adjacencyRemove(edge.srcUid,    uid);
        this.#adjacencyRemove(edge.targetUid, uid);
        this.#edges.delete(uid);
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
     * O(degree) via adjacency index — safe to call at 60 fps during drag.
     */
    refreshEdgePathsOfNode(nodeUid) {
        const edgeUids = this.#adjacency.get(nodeUid);
        if (!edgeUids?.size) return;
        for (const edgeUid of edgeUids) {
            this.refreshEdgePath(edgeUid);
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

        // Reactively reposition any objects anchored to this node
        const anchoredUids = this.#objectsByAnchor.get(uid);
        if (anchoredUids) {
            for (const oUid of anchoredUids) {
                const obj = this.#objects.get(oUid);
                if (obj) this.emit('object:moved', {
                    uid:    oUid,
                    x:      x + obj.offset.x,
                    y:      y + obj.offset.y,
                    offset: obj.offset,
                    object: obj,
                });
            }
        }

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

    /**
     * Persist a style object on a node and notify listeners.
     * This is the single source of truth for per-node styles — always use this
     * instead of mutating node.styleObj directly so that 'node:style-changed'
     * fires and presentation layers can update without a full re-render.
     *
     * @param {string} uid
     * @param {object} styleObj  Arbitrary style data — the UI layer defines the shape.
     */
    setNodeStyle(uid, styleObj) {
        const node = this.#nodes.get(uid);
        if (!node) return;
        node.styleObj = styleObj;
        this.emit('node:style-changed', { uid, styleObj, node });
    }

    /**
     * Read the persisted style object for a node.
     * Returns null if the node doesn't exist or has no committed styles.
     *
     * @param {string} uid
     * @returns {object|null}
     */
    getNodeStyle(uid) {
        return this.#nodes.get(uid)?.styleObj ?? null;
    }

    /**
     * Shallow-merge arbitrary opaque data onto a node and emit 'node:data-changed'.
     *
     * Use this instead of updateNode() when you want presentation layers to react
     * to external data enrichment (e.g. attaching media, composed forms, AI results)
     * without subscribing to the broad 'nodes:changed' event.
     *
     * Object.assign semantics — top-level keys are merged, nested objects are replaced.
     *
     * @param {string} uid
     * @param {object} data  Opaque payload — the UI layer defines the shape.
     */
    setNodeData(uid, data) {
        const node = this.#nodes.get(uid);
        if (!node) return;
        Object.assign(node, data);
        this.emit('node:data-changed', { uid, data, node });
    }

    /**
     * Read opaque data previously merged onto a node via setNodeData().
     * Returns the full node object (mutable reference — do not mutate).
     *
     * @param {string} uid
     * @returns {object|null}
     */
    getNodeData(uid) {
        return this.#nodes.get(uid) ?? null;
    }

    // ─── Objects ──────────────────────────────────────────────────────────────

    /**
     * Add a decorator object anchored to a node.
     *
     * An object is a positioned, opaque-data entity that tracks its anchor node.
     * Its absolute SVG position is always: anchor.x + offset.x, anchor.y + offset.y.
     * When the anchor node moves, 'object:moved' fires automatically.
     *
     * @param {string} uid        Unique identifier
     * @param {object} config
     * @param {string} config.anchoredTo   UID of the anchor node (required)
     * @param {{ x, y }} [config.offset]  Offset from anchor origin. Default: { x: 0, y: 0 }
     * @param {boolean}  [config.movable]  Whether the object can be dragged. Default: false
     * @param {string}   [config.type]     Opaque type string — presentation layer interprets
     */
    addObject(uid, config) {
        const { anchoredTo, offset = { x: 0, y: 0 }, movable = false, ...rest } = config;
        if (!this.#nodes.has(anchoredTo)) {
            console.warn(`[GraphStore] addObject: anchor node "${anchoredTo}" not found`);
            return null;
        }
        const object = { uid, anchoredTo, offset: { ...offset }, movable, ...rest };
        this.#objects.set(uid, object);

        if (!this.#objectsByAnchor.has(anchoredTo)) this.#objectsByAnchor.set(anchoredTo, new Set());
        this.#objectsByAnchor.get(anchoredTo).add(uid);

        this.emit('objects:changed', { objects: this.getObjects() });
        return object;
    }

    /**
     * Remove a decorator object by uid.
     */
    removeObject(uid) {
        const object = this.#objects.get(uid);
        if (!object) return;
        this.#objectsByAnchor.get(object.anchoredTo)?.delete(uid);
        this.#objects.delete(uid);
        this.emit('objects:changed', { objects: this.getObjects() });
    }

    /**
     * Move a movable object by updating its offset from its anchor node.
     * Emits 'object:moved' with the new absolute SVG position.
     *
     * @param {string} uid
     * @param {number} offsetX
     * @param {number} offsetY
     */
    moveObject(uid, offsetX, offsetY) {
        const object = this.#objects.get(uid);
        if (!object) return;
        object.offset = { x: offsetX, y: offsetY };
        const anchor = this.#nodes.get(object.anchoredTo);
        const x = (anchor?.x ?? 0) + offsetX;
        const y = (anchor?.y ?? 0) + offsetY;
        this.emit('object:moved', { uid, x, y, offset: object.offset, object });
    }

    /** @returns {object|null} */
    getObject(uid) { return this.#objects.get(uid) ?? null; }

    /** @returns {object[]} */
    getObjects() { return [...this.#objects.values()]; }

    /**
     * Return all objects anchored to a given node.
     * @param {string} nodeUid
     * @returns {object[]}
     */
    getObjectsForNode(nodeUid) {
        const uids = this.#objectsByAnchor.get(nodeUid);
        if (!uids) return [];
        return [...uids].map(uid => this.#objects.get(uid)).filter(Boolean);
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
        computeLayout(this.#nodes, this.#viewport, {
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
                    if (update.styleObj)   this.setNodeStyle(node.uid, update.styleObj);
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
        this.#adjacency.clear();
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
     *
     * IMPORTANT: fn() must be synchronous. Async functions are not supported —
     * #flushEvents() fires before any awaited work completes, so async mutations
     * inside the batch will emit after the flush, bypassing the dedup mechanism.
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

    // Delete a node and its connected edges, maintaining the adjacency index.
    // Also removes any objects anchored to this node.
    // Pure data removal — no event emission. Called by removeNode and removeNodes.
    #deleteNode(uid) {
        this.#nodes.delete(uid);
        const connectedEdgeUids = this.#adjacency.get(uid);
        if (connectedEdgeUids) {
            for (const eid of connectedEdgeUids) {
                const edge = this.#edges.get(eid);
                if (edge) {
                    const otherUid = edge.srcUid === uid ? edge.targetUid : edge.srcUid;
                    this.#adjacency.get(otherUid)?.delete(eid);
                    this.#edges.delete(eid);
                }
            }
            this.#adjacency.delete(uid);
        }
        // Remove orphaned objects anchored to this node
        const anchoredObjectUids = this.#objectsByAnchor.get(uid);
        if (anchoredObjectUids) {
            for (const oUid of anchoredObjectUids) this.#objects.delete(oUid);
            this.#objectsByAnchor.delete(uid);
        }
    }

    #adjacencyAdd(nodeUid, edgeUid) {
        let set = this.#adjacency.get(nodeUid);
        if (!set) { set = new Set(); this.#adjacency.set(nodeUid, set); }
        set.add(edgeUid);
    }

    #adjacencyRemove(nodeUid, edgeUid) {
        this.#adjacency.get(nodeUid)?.delete(edgeUid);
    }

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

/**
 * SelectionManager — headless selection state for graph nodes.
 *
 * Owns all selection concerns so the UI layer only subscribes to events
 * rather than managing its own parallel selection state.
 *
 * Instantiate with a GraphStore reference so it can auto-deselect
 * when nodes are removed.
 *
 * Events emitted:
 *   'selection:changed'  { selected, lastSelected, lastDeselected,
 *                          isMulti, compositeUid, compositeLabel }
 */


class SelectionManager extends EventBus {
    #selected = new Map();   // uid → node
    #lastSelected   = null;
    #lastDeselected = null;
    #store;

    /**
     * @param {import('./graph-store.js').GraphStore} store
     */
    constructor(store) {
        super();
        this.#store = store;

        // Auto-deselect on single-node removal
        store.on('node:removed', ({ uid }) => {
            if (this.#selected.has(uid)) {
                this.#lastDeselected = this.#selected.get(uid);
                this.#selected.delete(uid);
                this.#emit();
            }
        });

        // Auto-deselect on bulk removal — one selection:changed emission for the whole batch
        store.on('nodes:removed', ({ uids }) => {
            let anyChanged = false;
            for (const uid of uids) {
                if (this.#selected.has(uid)) {
                    this.#lastDeselected = this.#selected.get(uid);
                    this.#selected.delete(uid);
                    anyChanged = true;
                }
            }
            if (anyChanged) this.#emit();
        });
    }

    // ─── Selection API ────────────────────────────────────────────────────────

    /**
     * Select a node.
     * @param {string}  uid
     * @param {object}  [opts]
     * @param {boolean} [opts.addToSelection=false]  If false, clears previous selection first.
     */
    select(uid, { addToSelection = false } = {}) {
        const node = this.#store.getNode(uid);
        if (!node) return;

        if (!addToSelection) {
            this.#selected.forEach(n => { this.#lastDeselected = n; });
            this.#selected.clear();
        }

        this.#selected.set(uid, node);
        this.#lastSelected = node;
        this.#emit();
    }

    /**
     * Deselect a node. No-op if it wasn't selected.
     */
    deselect(uid) {
        if (!this.#selected.has(uid)) return;
        this.#lastDeselected = this.#selected.get(uid);
        this.#selected.delete(uid);
        this.#emit();
    }

    /**
     * Toggle selection of a node.
     */
    toggle(uid, { addToSelection = false } = {}) {
        if (this.#selected.has(uid)) {
            this.deselect(uid);
        } else {
            this.select(uid, { addToSelection });
        }
    }

    /**
     * Clear all selections.
     * @param {string[]} [excludeUids]  UIDs to keep selected.
     */
    clear(excludeUids = []) {
        if (!this.#selected.size) return;   // nothing selected — fast no-op

        let changed = false;
        if (excludeUids.length) {
            for (const uid of [...this.#selected.keys()]) {
                if (!excludeUids.includes(uid)) {
                    this.#lastDeselected = this.#selected.get(uid);
                    this.#selected.delete(uid);
                    changed = true;
                }
            }
        } else {
            this.#selected.forEach(n => { this.#lastDeselected = n; });
            this.#selected.clear();
            changed = true;
        }
        if (changed) this.#emit();
    }

    // ─── Queries ──────────────────────────────────────────────────────────────

    getSelected()     { return [...this.#selected.values()]; }
    getSelectedUids() { return [...this.#selected.keys()]; }
    isSelected(uid)   { return this.#selected.has(uid); }
    get count()       { return this.#selected.size; }
    get isMulti()     { return this.#selected.size > 1; }
    get lastSelected()   { return this.#lastSelected; }
    get lastDeselected() { return this.#lastDeselected; }

    /**
     * Stable composite key for the current selection — useful for caching
     * or deciding whether to re-run a query.
     */
    get compositeUid() {
        return this.getSelectedUids().sort().join('|');
    }

    /**
     * Human-readable label for the current selection.
     */
    get compositeLabel() {
        return this.getSelected()
            .map(n => n.title || n.content?.slice(0, 20) || n.uid)
            .join(', ');
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #emit() {
        this.emit('selection:changed', {
            selected:        this.getSelected(),
            lastSelected:    this.#lastSelected,
            lastDeselected:  this.#lastDeselected,
            isMulti:         this.isMulti,
            compositeUid:    this.compositeUid,
            compositeLabel:  this.compositeLabel,
        });
    }
}

/**
 * PlaceholderManager — headless state machine for drag-to-link interactions.
 *
 * Manages the lifecycle of an ephemeral placeholder node shown while the user
 * drags from a source node to create a new edge. Keeps all drag-link logic
 * out of the rendering layer.
 *
 * Usage:
 *   const linker = new PlaceholderManager(store);
 *   linker.start(fromUid);                    // user starts dragging
 *   linker.update(x, y);                      // cursor moves
 *   linker.commit(targetUid?);                // dropped on a node (or uses nearest snap)
 *   linker.cancel();                          // user released without target
 *
 * Events emitted:
 *   'draglink:started'    { fromNode }
 *   'draglink:updated'    { fromNode, placeholderUid, x, y, snapTarget: node|null }
 *   'draglink:committed'  { fromNode, targetNode, edgeUid }
 *   'draglink:cancelled'  { fromNode }
 */


// Proximity thresholds for auto-snap (px)
const SNAP_X_THRESHOLD = 300;
const SNAP_Y_THRESHOLD = 300;

class PlaceholderManager extends EventBus {
    /** @type {{ fromUid: string, placeholderUid: string, snapUid: string|null } | null} */
    #state = null;
    #store;
    #snapXThreshold;
    #snapYThreshold;

    /**
     * @param {import('./graph-store.js').GraphStore} store
     * @param {object} [options]
     * @param {number} [options.snapThreshold=300]   Uniform snap radius (px). Overridden by snapXThreshold/snapYThreshold.
     * @param {number} [options.snapXThreshold=300]  Horizontal snap radius (px).
     * @param {number} [options.snapYThreshold=300]  Vertical snap radius (px).
     */
    constructor(store, options = {}) {
        super();
        this.#store          = store;
        this.#snapXThreshold = options.snapXThreshold ?? options.snapThreshold ?? SNAP_X_THRESHOLD;
        this.#snapYThreshold = options.snapYThreshold ?? options.snapThreshold ?? SNAP_Y_THRESHOLD;
    }

    // ─── State machine ────────────────────────────────────────────────────────

    /**
     * Begin a drag-to-link gesture from the given node.
     */
    start(fromUid) {
        if (this.#state) this.cancel();   // guard: clean up any stale state

        const fromNode = this.#store.getNode(fromUid);
        if (!fromNode) return;

        const placeholderUid = `placeholder-${fromUid}-${Date.now()}`;

        // Add the ephemeral placeholder node at the source position
        this.#store.addNode({
            uid:   placeholderUid,
            type:  'placeholder',
            x:     fromNode.x ?? 0,
            y:     fromNode.y ?? 0,
            _x:    fromNode.x ?? 0,
            _y:    fromNode.y ?? 0,
            w:     2,
            h:     2,
            links: [{ targetUid: fromUid, type: 'placeholder' }],
        });

        // Edge from source → placeholder
        this.#store.addEdge({
            srcUid:    fromUid,
            targetUid: placeholderUid,
            type:      'placeholder',
        });

        this.#state = { fromUid, placeholderUid, snapUid: null };
        this.emit('draglink:started', { fromNode });
    }

    /**
     * Update the placeholder position as the cursor moves.
     * Detects snap candidates within threshold distance.
     *
     * @param {number} x  Cursor x in SVG coordinate space
     * @param {number} y  Cursor y in SVG coordinate space
     * @param {number} [xThreshold]
     * @param {number} [yThreshold]
     */
    update(x, y, xThreshold = this.#snapXThreshold, yThreshold = this.#snapYThreshold) {
        if (!this.#state) return;
        const { fromUid, placeholderUid } = this.#state;

        // Move placeholder to cursor
        this.#store.moveNode(placeholderUid, x, y);

        // Find the closest snap target (excludes source and placeholder itself)
        const nearby = this.#store.getNodesAroundPoint(
            x, y, xThreshold, yThreshold,
            [fromUid, placeholderUid]
        );
        const snapTarget = nearby[0] ?? null;
        this.#state.snapUid = snapTarget?.uid ?? null;

        this.emit('draglink:updated', {
            fromNode:       this.#store.getNode(fromUid),
            placeholderUid,
            x,
            y,
            snapTarget,
        });
    }

    /**
     * Commit the link — either to an explicit target or to the current snap target.
     * Removes the placeholder and creates a real edge.
     *
     * @param {string} [explicitTargetUid]  Override snap; if falsy, uses snap target.
     * @returns {boolean}  true if an edge was created.
     */
    commit(explicitTargetUid) {
        if (!this.#state) return false;
        const { fromUid, placeholderUid, snapUid } = this.#state;
        const targetUid = explicitTargetUid || snapUid;

        // Remove placeholder regardless of outcome
        this.#store.removeNode(placeholderUid);

        const fromNode = this.#store.getNode(fromUid);
        let edgeUid = null;

        if (targetUid && targetUid !== fromUid && this.#store.hasNode(targetUid)) {
            const edge = this.#store.addEdge({
                srcUid:    fromUid,
                targetUid,
                type:      'default',
            });
            edgeUid = edge?.uid ?? null;

            // Keep node.links in sync (source of truth for traversal)
            if (fromNode && !fromNode.links.some(l => l.targetUid === targetUid)) {
                fromNode.links.push({ targetUid, type: 'default' });
            }
        }

        this.emit('draglink:committed', {
            fromNode,
            targetNode: targetUid ? this.#store.getNode(targetUid) : null,
            edgeUid,
        });

        this.#state = null;
        return !!edgeUid;
    }

    /**
     * Cancel the gesture — removes placeholder, no edge created.
     */
    cancel() {
        if (!this.#state) return;
        const { fromUid, placeholderUid } = this.#state;
        this.#store.removeNode(placeholderUid);
        this.emit('draglink:cancelled', { fromNode: this.#store.getNode(fromUid) });
        this.#state = null;
    }

    // ─── Queries ──────────────────────────────────────────────────────────────

    get isActive()       { return this.#state !== null; }
    get state()          { return this.#state ? { ...this.#state } : null; }
    get snapTarget()     {
        return this.#state?.snapUid
            ? this.#store.getNode(this.#state.snapUid)
            : null;
    }
}

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
function propagate(graph, fromUid, options = {}) {
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
function reachable(graph, fromUid, options = {}) {
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
function shortestPath(graph, fromUid, toUid, options = {}) {
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
function allPaths(graph, fromUid, toUid, options = {}) {
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

/**
 * Polyline path geometry — SVG paths through ordered waypoints.
 *
 * Produces SVG polyline or smooth-curve paths from an array of [x, y] points.
 * Used for edges that follow real-world routes (pipe networks, cable runs,
 * transmission lines) rather than abstract bezier curves between ports.
 *
 * Complements link-path.js (port-to-port bezier) — not a replacement.
 * The link-type ontology determines which path function an edge uses.
 */

/**
 * Straight-segment polyline through waypoints.
 *
 * @param {[number, number][]} points  Array of [x, y] coordinates
 * @returns {string} SVG path `d` attribute
 */
function polylinePath(points) {
    if (!points?.length) return '';
    if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;

    const [first, ...rest] = points;
    return `M${first[0]},${first[1]}` + rest.map(p => `L${p[0]},${p[1]}`).join('');
}

/**
 * Smooth polyline using Catmull-Rom-to-cubic-bezier conversion.
 * Passes through every waypoint (unlike raw cubic bezier which only
 * approximates intermediate points).
 *
 * @param {[number, number][]} points   Array of [x, y] coordinates (min 2)
 * @param {number}             [tension=0.5]  0 = sharp corners, 1 = very smooth
 * @returns {string} SVG path `d` attribute
 */
function smoothPolylinePath(points, tension = 0.5) {
    if (!points?.length) return '';
    if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
    if (points.length === 2) return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`;

    const n = points.length;
    let d = `M${points[0][0]},${points[0][1]}`;

    for (let i = 0; i < n - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(n - 1, i + 2)];

        // Catmull-Rom tangents scaled by tension
        const tx1 = tension * (p2[0] - p0[0]) / 3;
        const ty1 = tension * (p2[1] - p0[1]) / 3;
        const tx2 = tension * (p3[0] - p1[0]) / 3;
        const ty2 = tension * (p3[1] - p1[1]) / 3;

        const cp1x = p1[0] + tx1;
        const cp1y = p1[1] + ty1;
        const cp2x = p2[0] - tx2;
        const cp2y = p2[1] - ty2;

        d += `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }

    return d;
}

/**
 * Compute an SVG path for an edge with waypoints stored in edge.data.
 *
 * Falls back to a straight line between src and target if no waypoints exist.
 * Designed to be called by the rendering layer as an alternative to
 * computeNodeLinkPath() when an edge's link type specifies polyline geometry.
 *
 * @param {object}   edge          Edge with { srcUid, targetUid, data }
 * @param {object}   srcNode       Node with { x, y, w, h }
 * @param {object}   targetNode    Node with { x, y, w, h }
 * @param {object}   [options]
 * @param {boolean}  [options.smooth=false]   Use Catmull-Rom smoothing
 * @param {number}   [options.tension=0.5]    Smoothing tension (0-1)
 * @returns {string} SVG path `d` attribute
 */
function computePolylinePath(edge, srcNode, targetNode, { smooth = false, tension = 0.5 } = {}) {
    const sx = srcNode.movedX  ?? srcNode.x  ?? 0;
    const sy = srcNode.movedY  ?? srcNode.y  ?? 0;
    const tx = targetNode.movedX ?? targetNode.x ?? 0;
    const ty = targetNode.movedY ?? targetNode.y ?? 0;

    const waypoints = edge.data?.waypoints;

    // No waypoints — straight line
    if (!waypoints?.length) {
        return `M${sx},${sy}L${tx},${ty}`;
    }

    const points = [
        [sx, sy],
        ...waypoints.map(wp => [wp[0] ?? wp.x ?? 0, wp[1] ?? wp.y ?? 0]),
        [tx, ty],
    ];

    return smooth ? smoothPolylinePath(points, tension) : polylinePath(points);
}

/**
 * Pan target geometry — pure math for centering a node in a viewport.
 *
 * Given a node's SVG position and dimensions, a viewport size, and a zoom
 * level, returns the pan values that place the node's centre at the viewport
 * centre (with an optional offset). No DOM, no rendering, no side effects.
 *
 * Coordinate identity:
 *   screenX = svgX * zoom + panX
 *
 * To centre node horizontally in viewport at a given zoom:
 *   panX = vpWidth/2 - nodeWidth/2 - node.x * zoom
 *
 * With xOffset (e.g. 200px left-of-centre to leave room for a side panel):
 *   panX = vpWidth/2 - nodeWidth/2 - xOffset - node.x * zoom
 */

/**
 * Compute the pan values that centre a node in the viewport.
 *
 * @param {object} node         Node with { x, y }
 * @param {object} layout       Node type layout config with { width, height }
 * @param {object} viewport     Viewport dimensions { width, height } in screen px
 * @param {object} [options]
 * @param {number} [options.zoom=1]     The zoom level at which to compute (use final zoom, not current)
 * @param {number} [options.xOffset=0]  Horizontal offset from centre (positive = shift left)
 * @param {number} [options.yOffset=0]  Vertical offset from centre (positive = shift up)
 * @returns {{ x: number, y: number }}  Target pan in screen pixels
 */
function getPanTargetForNode(node, layout, viewport, { zoom = 1, xOffset = 0, yOffset = 0 } = {}) {
    return {
        x: viewport.width  / 2 - layout.width  / 2 - xOffset - node.x * zoom,
        y: viewport.height / 2 - layout.height / 2 - yOffset - node.y * zoom,
    };
}

/**
 * Compute the pan and zoom values that fit all placed nodes into the viewport.
 *
 * Pure math — no side effects. Pass the result directly to animateTo() for a
 * smooth transition, or apply immediately via setPan() + zoomToCenter().
 *
 * @param {object[]} nodes      All nodes from store.getNodes() — unplaced nodes (x == null) are skipped
 * @param {object}   viewport   Viewport dimensions { width, height } in screen px
 * @param {object}   [options]
 * @param {number}   [options.padding=0.9]   Fraction of viewport to fill (0.9 = 10% margin on each side)
 * @param {number}   [options.minZoom=0.1]   Floor on the computed zoom
 * @param {number}   [options.maxZoom=1]     Ceiling on the computed zoom — default 1 prevents magnifying
 *                                           a small graph beyond actual size
 * @returns {{ pan: { x, y }, zoom } | null}  null if no placed nodes
 */
function getFitToContent(nodes, viewport, { padding = 0.9, minZoom = 0.1, maxZoom = 1 } = {}) {
    const placed = nodes.filter(n => n.x != null && n.y != null);
    if (!placed.length) return null;

    // Bounding box across all placed nodes — uses per-node w/h (set at addNode time)
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    for (const n of placed) {
        bMinX = Math.min(bMinX, n.x);
        bMinY = Math.min(bMinY, n.y);
        bMaxX = Math.max(bMaxX, n.x + n.w);
        bMaxY = Math.max(bMaxY, n.y + n.h);
    }

    const contentW = bMaxX - bMinX;
    const contentH = bMaxY - bMinY;

    // Zoom to fit, clamped to [minZoom, maxZoom]
    const rawZoom = Math.min(
        (viewport.width  * padding) / contentW,
        (viewport.height * padding) / contentH,
    );
    const zoom = Math.min(Math.max(rawZoom, minZoom), maxZoom);

    // Pan to centre the bounding box midpoint in the viewport
    const pan = {
        x: viewport.width  / 2 - (bMinX + contentW / 2) * zoom,
        y: viewport.height / 2 - (bMinY + contentH / 2) * zoom,
    };

    return { pan, zoom };
}

/**
 * Spatial geometry utilities — pure math over node bounding boxes.
 * No DOM, no layout, no traversal concerns.
 *
 * Coordinate system: graph/SVG space (same as node x, y, w, h).
 */

/**
 * Returns the topmost node whose bounding box contains the given point.
 *
 * Nodes are checked in reverse array order so that nodes rendered on top
 * (later in the array) are matched first — consistent with visual z-order.
 *
 * @param {number}   x        Point x in graph/SVG space
 * @param {number}   y        Point y in graph/SVG space
 * @param {object[]} nodes    Node array — each must have { x, y, w, h, uid }
 * @param {object}   [opts]
 * @param {string[]} [opts.exclude]   UIDs to skip (e.g. the source node during port drag)
 * @param {number}   [opts.padding]   Expand each node's hit area by this many px (default 0)
 * @returns {object|null}  The matched node, or null if none contains the point
 */
function getNodeAtPoint(x, y, nodes, { exclude = [], padding = 0 } = {}) {
    const skip = exclude.length ? new Set(exclude) : null;
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (skip?.has(n.uid)) continue;
        if (
            x >= n.x - padding &&
            x <= n.x + n.w + padding &&
            y >= n.y - padding &&
            y <= n.y + n.h + padding
        ) {
            return n;
        }
    }
    return null;
}

/**
 * Returns all nodes whose bounding boxes overlap the given rectangle.
 *
 * Useful for lasso/marquee selection.
 *
 * @param {number}   rx, ry    Top-left corner of the query rectangle
 * @param {number}   rw, rh    Width and height of the query rectangle
 * @param {object[]} nodes
 * @returns {object[]}
 */
function getNodesInRect(rx, ry, rw, rh, nodes) {
    const x2 = rx + rw;
    const y2 = ry + rh;
    return nodes.filter(n =>
        n.x        < x2 &&
        n.x + n.w  > rx &&
        n.y        < y2 &&
        n.y + n.h  > ry
    );
}

/**
 * PanZoomState — headless pan/zoom state machine.
 *
 * Owns all pan/zoom math: current state, target computation, coordinate
 * transforms, and clamping. Zero DOM, zero SVG, zero rendering concerns.
 *
 * The rendering layer (PanZoomManager) reads state from here and writes the
 * CSS transform. Input events (wheel, pointer drag) call mutate methods and
 * read back the new transform to apply.
 *
 * Coordinate convention (matches the SVG rendering model):
 *   screenX = svgX * zoom + panX
 *   screenY = svgY * zoom + panY
 *
 *   pan values are in screen pixels.
 *   svg coordinates are in SVG user units (1:1 with CSS px for a non-scaled SVG).
 */

class PanZoomState {
    #pan  = { x: 0, y: 0 };
    #zoom = 1;
    #minZoom = 0.05;
    #maxZoom = 10;

    /**
     * @param {object} [opts]
     * @param {number} [opts.minZoom=0.05]
     * @param {number} [opts.maxZoom=10]
     */
    constructor({ minZoom, maxZoom } = {}) {
        if (minZoom != null) this.#minZoom = minZoom;
        if (maxZoom != null) this.#maxZoom = maxZoom;
    }

    // ─── State accessors ──────────────────────────────────────────────────────

    get pan()  { return { ...this.#pan }; }
    get zoom() { return this.#zoom; }

    getTransform() {
        return `matrix(${this.#zoom},0,0,${this.#zoom},${this.#pan.x},${this.#pan.y})`;
    }

    // ─── Mutation ─────────────────────────────────────────────────────────────

    setPan(x, y) {
        this.#pan = { x, y };
    }

    panBy(dx, dy) {
        this.#pan = { x: this.#pan.x + dx, y: this.#pan.y + dy };
    }

    /**
     * Zoom towards a screen point (sx, sy) — the point stays fixed on screen.
     * This is the standard "zoom to cursor" behaviour used by wheel events.
     *
     * @param {number} newZoom   Desired absolute zoom level
     * @param {number} sx        Screen x of the focal point (e.g. cursor position)
     * @param {number} sy        Screen y of the focal point
     */
    zoomToPoint(newZoom, sx, sy) {
        const clamped = Math.min(Math.max(newZoom, this.#minZoom), this.#maxZoom);
        const ratio   = clamped / this.#zoom;
        // Keep (sx, sy) fixed: pan adjusts so the SVG point under the cursor doesn't move.
        this.#pan = {
            x: sx - ratio * (sx - this.#pan.x),
            y: sy - ratio * (sy - this.#pan.y),
        };
        this.#zoom = clamped;
    }

    /**
     * Set zoom around the centre of the viewport (used for programmatic zoom).
     */
    zoomToCenter(newZoom, vpWidth, vpHeight) {
        this.zoomToPoint(newZoom, vpWidth / 2, vpHeight / 2);
    }

    /**
     * Set zoom level directly without adjusting pan.
     * Use during simultaneous pan+zoom animation where pan is already
     * computed for the final zoom — adjusting pan via zoomToPoint would
     * undo the carefully placed target pan.
     */
    setZoomRaw(v) {
        this.#zoom = Math.min(Math.max(v, this.#minZoom), this.#maxZoom);
    }

    setMinZoom(v) { this.#minZoom = v; }
    setMaxZoom(v) { this.#maxZoom = v; }

    // ─── Coordinate transforms ────────────────────────────────────────────────

    /** Convert screen coordinates to SVG/canvas coordinates. */
    screenToSvg(sx, sy) {
        return {
            x: (sx - this.#pan.x) / this.#zoom,
            y: (sy - this.#pan.y) / this.#zoom,
        };
    }

    /** Convert SVG/canvas coordinates to screen coordinates. */
    svgToScreen(svgX, svgY) {
        return {
            x: svgX * this.#zoom + this.#pan.x,
            y: svgY * this.#zoom + this.#pan.y,
        };
    }
}

/**
 * GraphCanvasState — single source of truth for all computed canvas state.
 *
 * Composes GraphStore (node data + layout) with PanZoomState (pan/zoom) and
 * viewport dimensions to produce fully computed, ready-to-apply state.
 *
 * The rendering layer reads from this object and applies values directly to
 * the DOM — it performs zero computation of its own.
 *
 * Architecture contract:
 *   Headless layer  → owns ALL state and ALL derived math
 *   Rendering layer → owns ONLY DOM mutations and event binding
 *
 * Coordinate convention:
 *   screenX = svgX * zoom + panX
 *   pan is in screen pixels; SVG coords are 1:1 with CSS px for our SVG.
 */


class GraphCanvasState {
    #store;
    #panZoom;
    #viewport;

    /**
     * @param {GraphStore} store
     * @param {object}     [opts]
     * @param {number}     [opts.width=800]
     * @param {number}     [opts.height=600]
     * @param {number}     [opts.minZoom=0.05]
     * @param {number}     [opts.maxZoom=10]
     */
    constructor(store, { width = 800, height = 600, minZoom, maxZoom } = {}) {
        this.#store    = store;
        this.#panZoom  = new PanZoomState({ minZoom, maxZoom });
        this.#viewport = { width, height };
    }

    // ─── Viewport ─────────────────────────────────────────────────────────────

    setViewport(width, height) {
        this.#viewport = { width, height };
    }

    getViewport() {
        return { ...this.#viewport };
    }

    // ─── Transform ────────────────────────────────────────────────────────────

    /** SVG matrix transform string — apply directly to the <g> viewport element. */
    getTransform() {
        return this.#panZoom.getTransform();
    }

    // ─── Pan / zoom state ─────────────────────────────────────────────────────

    get pan()  { return this.#panZoom.pan; }
    get zoom() { return this.#panZoom.zoom; }

    setPan(x, y)         { this.#panZoom.setPan(x, y); }
    panBy(dx, dy)        { this.#panZoom.panBy(dx, dy); }
    setZoomRaw(v)        { this.#panZoom.setZoomRaw(v); }
    setMinZoom(v)        { this.#panZoom.setMinZoom(v); }
    setMaxZoom(v)        { this.#panZoom.setMaxZoom(v); }

    /**
     * Zoom toward a screen point (keeps that point fixed on screen).
     * Use for wheel zoom — cursor stays under the mouse.
     */
    zoomToPoint(newZoom, screenX, screenY) {
        this.#panZoom.zoomToPoint(newZoom, screenX, screenY);
    }

    /**
     * Zoom around the viewport centre.
     * Use for programmatic zoom (buttons, API).
     */
    zoomToCenter(newZoom) {
        this.#panZoom.zoomToCenter(newZoom, this.#viewport.width, this.#viewport.height);
    }

    // ─── Coordinate transforms ────────────────────────────────────────────────

    /** Convert screen coordinates to SVG/canvas coordinates. */
    screenToSvg(sx, sy) { return this.#panZoom.screenToSvg(sx, sy); }

    /** Convert SVG/canvas coordinates to screen coordinates. */
    svgToScreen(svgX, svgY) { return this.#panZoom.svgToScreen(svgX, svgY); }

    // ─── Node screen positions ────────────────────────────────────────────────

    /**
     * Returns the screen-space bounding rect of a node.
     * Accounts for current pan and zoom.
     *
     * @param {string} uid
     * @returns {{ x, y, width, height } | null}
     */
    getNodeScreenRect(uid) {
        const node = this.#store.getNode(uid);
        if (!node || node.x == null) return null;

        const cfg  = getNodeTypeConfig(node.type).layout;
        const pan  = this.#panZoom.pan;
        const zoom = this.#panZoom.zoom;

        return {
            x:      node.x * zoom + pan.x,
            y:      node.y * zoom + pan.y,
            width:  (node.w ?? cfg.width)  * zoom,
            height: (node.h ?? cfg.height) * zoom,
        };
    }

    /**
     * Returns the screen position of the action overlay anchor for a node.
     * Anchor sits just to the right of the node, aligned to its top edge.
     *
     * @param {string} uid
     * @param {number} [gap=10]  Pixel gap between node right edge and overlay
     * @returns {{ x, y } | null}
     */
    getOverlayAnchor(uid, gap = 10) {
        const rect = this.getNodeScreenRect(uid);
        if (!rect) return null;
        return { x: rect.x + rect.width + gap, y: rect.y };
    }

    /**
     * Computes the pan values that centre a node in the viewport at a given zoom.
     * Pass this directly to the animation layer — no further math needed.
     *
     * @param {string} uid
     * @param {object} [options]
     * @param {number} [options.zoom]       Target zoom (defaults to current)
     * @param {number} [options.xOffset=0]  Shift node left of centre by this many px
     * @param {number} [options.yOffset=0]  Shift node above centre by this many px
     * @returns {{ x, y } | null}
     */
    getPanTargetForNode(uid, { zoom, xOffset = 0, yOffset = 0 } = {}) {
        const node = this.#store.getNode(uid);
        if (!node || node.x == null) return null;

        const cfg       = getNodeTypeConfig(node.type).layout;
        const finalZoom = zoom ?? this.#panZoom.zoom;
        const vp        = this.#viewport;

        return {
            x: vp.width  / 2 - cfg.width  / 2 - xOffset - node.x * finalZoom,
            y: vp.height / 2 - cfg.height / 2 - yOffset - node.y * finalZoom,
        };
    }

    /**
     * Returns true if any part of the node is currently visible in the viewport.
     */
    isNodeInViewport(uid) {
        const rect = this.getNodeScreenRect(uid);
        if (!rect) return false;
        const vp = this.#viewport;
        return rect.x < vp.width  && rect.x + rect.width  > 0 &&
               rect.y < vp.height && rect.y + rect.height > 0;
    }
}

/**
 * ActorRegistry — identity store for actors operating on a graph.
 *
 * An "actor" is any entity that can interact with graph data:
 * a human user, an AI agent, an automated pipeline, etc.
 *
 * The graph layer carries only opaque identifier strings on node/edge data
 * (node.createdBy, node.updatedBy[]). This registry is the lookup point
 * for display metadata — nicknames, colours, avatars, roles, etc.
 *
 * Deliberately NOT a reactive state machine. The presentation layer owns
 * reactivity. This is a plain lookup with a minimal CRUD API.
 *
 * Zero dependencies. No DOM. No graph coupling.
 *
 * Suggested metadata fields (open object — none are enforced):
 *   nickname  {string}   — display name
 *   color     {string}   — CSS colour string, used for cursor / presence rendering
 *   avatar    {string}   — URL or initials string
 *   type      {string}   — 'human' | 'agent' | 'system'
 *   [any]                — extend freely; the library carries it opaquely
 */

class ActorRegistry {
    #actors = new Map();  // actorId → { actorId, ...metadata }

    /**
     * Register an actor. If the actor already exists, metadata is merged (shallow).
     *
     * @param {string} actorId   Opaque identifier — must match the strings used in
     *                           node.createdBy and node.updatedBy[] entries.
     * @param {object} [metadata={}]
     */
    register(actorId, metadata = {}) {
        const existing = this.#actors.get(actorId) ?? {};
        this.#actors.set(actorId, { ...existing, ...metadata, actorId });
    }

    /**
     * Partially update metadata for an existing actor.
     * Silently ignores unknown actorIds — register first.
     *
     * @param {string} actorId
     * @param {object} metadata  Partial metadata to merge
     */
    update(actorId, metadata) {
        const actor = this.#actors.get(actorId);
        if (!actor) return;
        Object.assign(actor, metadata);
    }

    /**
     * @param {string} actorId
     * @returns {object|undefined}
     */
    get(actorId) {
        return this.#actors.get(actorId);
    }

    /** @returns {object[]} All registered actors */
    getAll() {
        return [...this.#actors.values()];
    }

    /** @param {string} actorId */
    has(actorId) {
        return this.#actors.has(actorId);
    }

    /**
     * Remove an actor from the registry.
     * Does not affect any graph data — identifier strings on nodes/edges are untouched.
     *
     * @param {string} actorId
     */
    unregister(actorId) {
        this.#actors.delete(actorId);
    }

    /** @returns {number} */
    get size() {
        return this.#actors.size;
    }
}

/**
 * SessionLog — append-only event log for a graph session.
 *
 * A session is the raw, complete record of everything that happened on a graph:
 * mutations, interactions, cursor movements, agent actions, external events.
 * The graph itself is a curated projection of semantically significant events.
 * The session is the superset.
 *
 * Design principles:
 *   - Append-only: events are never modified or removed (immutable historical record)
 *   - Independent: works with or without a live GraphStore
 *   - If a GraphStore is provided, auto-captures all mutation events
 *   - Accepts external events via record() — cursors, selections, network events, etc.
 *   - Emits 'session:event' on every append so downstream consumers (PresenceState,
 *     analytics, replay) can react without polling
 *
 * ─── Event schema ─────────────────────────────────────────────────────────────
 *
 *   {
 *     id        {string}       — monotonic session-scoped identifier
 *     type      {string}       — event type string (see types below)
 *     actorId   {string|null}  — who caused this event; null = system / unknown
 *     timestamp {number}       — epoch ms
 *     payload   {object}       — type-specific data (see types below)
 *   }
 *
 * ─── Built-in event types ─────────────────────────────────────────────────────
 *
 * Auto-captured from GraphStore (when store option is provided):
 *   'nodes:changed'       payload: { uids: string[] }
 *   'node:removed'        payload: { uid, descendantUids: string[] }
 *   'node:moved'          payload: { uid, x, y }           ← SVG coordinate space
 *   'node:status-changed' payload: { uid, status }
 *   'edges:changed'       payload: { uids: string[] }
 *   'layout:computed'     payload: { nodeCount, edgeCount }
 *
 * Recorded by the presentation layer via record():
 *   'cursor:moved'        payload: { x, y }                ← SVG coordinate space
 *   'selection:changed'   payload: { uids: string[] }
 *   'viewport:panned'     payload: { x, y }
 *   'viewport:zoomed'     payload: { zoom }
 *
 * Any application-defined type string is accepted — the log is open.
 */


let _counter = 0;
function nextId() { return `se-${++_counter}`; }

class SessionLog extends EventBus {
    #events        = [];   // append-only array of event objects
    #unsubscribers = [];   // teardown handles for GraphStore subscriptions

    /**
     * @param {object}      [options]
     * @param {object}      [options.store]    GraphStore instance to auto-subscribe to.
     *                                         All mutation events are captured automatically.
     * @param {string|null} [options.actorId]  Default actorId stamped on auto-captured
     *                                         store events. Override per-record() call as needed.
     */
    constructor(options = {}) {
        super();
        if (options.store) {
            this.#subscribeToStore(options.store, options.actorId ?? null);
        }
    }

    /**
     * Record a single event into the log.
     *
     * This is the primary ingestion point for all event sources:
     * auto-captured store mutations, local cursor tracking, remote network events,
     * agent actions — anything that happened in this session.
     *
     * @param {object}      event
     * @param {string}      event.type
     * @param {object}      [event.payload={}]
     * @param {string|null} [event.actorId=null]
     * @param {number}      [event.timestamp]   Defaults to Date.now(). Pass an explicit
     *                                           value when ingesting historical/remote events.
     * @returns {object}  The stored event (id stamped)
     */
    record({ type, payload = {}, actorId = null, timestamp = Date.now() }) {
        const event = { id: nextId(), type, actorId, timestamp, payload };
        this.#events.push(event);
        this.emit('session:event', event);
        return event;
    }

    /**
     * Query the log with optional filters.
     * Returns a new array — the internal log is never exposed directly.
     *
     * @param {object}      [filters={}]
     * @param {string}      [filters.actorId]    — exact match on actorId
     * @param {string}      [filters.type]       — exact match on event type
     * @param {string}      [filters.typePrefix] — prefix match (e.g. 'node:' matches all node events)
     * @param {number}      [filters.since]      — epoch ms lower bound (inclusive)
     * @param {number}      [filters.until]      — epoch ms upper bound (inclusive)
     * @returns {object[]}
     */
    getEvents(filters = {}) {
        return this.#events.filter(e => {
            if (filters.actorId    != null && e.actorId  !== filters.actorId)          return false;
            if (filters.type       != null && e.type     !== filters.type)             return false;
            if (filters.typePrefix != null && !e.type.startsWith(filters.typePrefix))  return false;
            if (filters.since      != null && e.timestamp < filters.since)             return false;
            if (filters.until      != null && e.timestamp > filters.until)             return false;
            return true;
        });
    }

    /** @returns {number} Total number of events recorded */
    get size() {
        return this.#events.length;
    }

    /**
     * Unsubscribe from a connected GraphStore and remove all listeners.
     * The historical event log is preserved — call getEvents() after destroy() if needed.
     */
    destroy() {
        this.#unsubscribers.forEach(fn => fn());
        this.#unsubscribers = [];
        this.clear();  // EventBus: removes all registered listeners
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #subscribeToStore(store, defaultActorId) {
        // Helper: subscribe and return unsubscriber; slim payloads only (no full node objects)
        const sub = (type, mapper) =>
            store.on(type, payload =>
                this.record({ type, payload: mapper(payload), actorId: defaultActorId })
            );

        this.#unsubscribers = [
            // Node mutations
            sub('nodes:changed',
                ({ nodes })              => ({ uids: nodes.map(n => n.uid) })),
            sub('node:removed',
                ({ uid, descendants })   => ({ uid, descendantUids: descendants.map(n => n.uid) })),
            sub('node:moved',
                ({ uid, x, y })          => ({ uid, x, y })),
            sub('node:status-changed',
                ({ uid, status })        => ({ uid, status })),
            // Edge mutations
            sub('edges:changed',
                ({ edges })              => ({ uids: edges.map(e => e.uid) })),
            // Layout
            sub('layout:computed',
                ({ nodes, edges })       => ({ nodeCount: nodes.length, edgeCount: edges.length })),
        ];
    }
}

/**
 * PresenceState — live per-actor state, derived from session events.
 *
 * While SessionLog is the historical record (everything that ever happened),
 * PresenceState is the current snapshot (what each actor is doing right now).
 * These are two distinct concerns that share the same event source.
 *
 * Designed for real-time rendering: cursor overlays, per-actor selection
 * highlights, connection indicators. The presentation layer subscribes to
 * 'presence:updated' and renders using ActorRegistry for display metadata
 * (color, nickname, avatar, etc.).
 *
 * Can be driven from multiple sources:
 *   - A SessionLog instance (subscribes to 'session:event')
 *   - Direct calls to updateCursor() / updateSelection() for the local actor
 *   - Remote events relayed through a SessionLog (network → record() → here)
 *
 * ─── Per-actor presence shape ─────────────────────────────────────────────────
 *
 *   {
 *     actorId   {string}         — matches ActorRegistry key and node.createdBy strings
 *     cursor    {object|null}    — { x, y } in SVG coordinate space, or null (off-canvas)
 *     selection {string[]}       — UIDs of nodes this actor currently has selected
 *     lastSeen  {number}         — epoch ms of the last recorded activity
 *   }
 *
 * Coordinates are always SVG-space (graph-absolute), never screen-space.
 * The presentation layer applies the same pan/zoom transform as everything else —
 * actor cursors correctly follow graph content at any zoom level.
 *
 * ─── Events emitted ───────────────────────────────────────────────────────────
 *
 *   'presence:updated'  { actorId, presence }  — on any per-actor state change
 */


class PresenceState extends EventBus {
    #presence    = new Map();  // actorId → presence object
    #unsubscribe = null;

    /**
     * @param {object} [options]
     * @param {object} [options.sessionLog]  SessionLog instance to subscribe to.
     *                                       cursor:moved and selection:changed events
     *                                       are automatically applied. All other events
     *                                       with a non-null actorId update lastSeen.
     */
    constructor(options = {}) {
        super();
        if (options.sessionLog) {
            this.#unsubscribe = options.sessionLog.on('session:event', e => this.#handleEvent(e));
        }
    }

    /**
     * Update the cursor position for an actor.
     *
     * Call this for the local actor from bindCursorCapture() results.
     * For remote actors, route through SessionLog.record() instead so the
     * event is also persisted in the log.
     *
     * @param {string}              actorId
     * @param {{x:number,y:number}|null} pos  SVG-space coordinates, or null to clear
     *                                         (actor moved off-canvas or disconnected)
     */
    updateCursor(actorId, pos) {
        this.#touch(actorId, { cursor: pos });
    }

    /**
     * Update the active selection for an actor.
     *
     * @param {string}   actorId
     * @param {string[]} uids  Currently selected node UIDs
     */
    updateSelection(actorId, uids) {
        this.#touch(actorId, { selection: uids });
    }

    /**
     * @param {string} actorId
     * @returns {object|undefined}
     */
    getPresence(actorId) {
        return this.#presence.get(actorId);
    }

    /** @returns {object[]} Presence objects for all known actors */
    getAll() {
        return [...this.#presence.values()];
    }

    /**
     * Actors with a non-null cursor (actively moving on the canvas).
     * Useful for the presentation layer to know which cursors to render.
     *
     * @returns {object[]}
     */
    getActiveCursors() {
        return [...this.#presence.values()].filter(p => p.cursor !== null);
    }

    destroy() {
        if (this.#unsubscribe) this.#unsubscribe();
        this.#unsubscribe = null;
        this.clear();  // EventBus: removes all registered listeners
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #touch(actorId, updates) {
        const existing = this.#presence.get(actorId) ?? {
            actorId,
            cursor:    null,
            selection: [],
            lastSeen:  0,
        };
        const next = { ...existing, ...updates, lastSeen: Date.now() };
        this.#presence.set(actorId, next);
        this.emit('presence:updated', { actorId, presence: next });
        return next;
    }

    #handleEvent(event) {
        if (!event.actorId) return;

        if (event.type === 'cursor:moved') {
            this.updateCursor(event.actorId, event.payload ?? null);
        } else if (event.type === 'selection:changed') {
            this.updateSelection(event.actorId, event.payload.uids ?? []);
        } else {
            // Any event with a known actorId keeps lastSeen current
            this.#touch(event.actorId, {});
        }
    }
}

/**
 * @file serializer/serialize.js
 * Serialize a graph (GraphAbstract or GraphStore snapshot) to a canonical XML string.
 * Round-trips cleanly with parse() — no information lost.
 *
 * The XML format is:
 *
 *   <wity-knowledge version="1">
 *     <nodes>
 *       <node uid="n1" type="continuant" label="...">
 *         <data key="pressure" type="number">320</data>
 *         <data key="status">open</data>
 *       </node>
 *     </nodes>
 *     <edges>
 *       <edge uid="..." src="n1" target="n2" type="default">
 *         <data key="weight">0.8</data>
 *       </edge>
 *     </edges>
 *   </wity-knowledge>
 *
 * @module serializer/serialize
 */

// ─── XML helpers ─────────────────────────────────────────────────────────────

function escapeAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeText(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function attr(name, value) {
    if (value == null || value === '') return '';
    return ` ${name}="${escapeAttr(value)}"`;
}

function indent(depth) {
    return '  '.repeat(depth);
}

// ─── Data serialization ─────────────────────────────────────────────────────

/**
 * Serialize a node.data or edge.data object into <data> child elements.
 * Handles primitives, arrays (JSON-encoded), and nested objects (JSON-encoded).
 *
 * @param {object} data
 * @param {number} depth — indentation depth
 * @returns {string} XML fragment
 */
function serializeData(data, depth) {
    if (!data || typeof data !== 'object') return '';
    const entries = Object.entries(data);
    if (!entries.length) return '';

    let xml = '';
    for (const [key, value] of entries) {
        if (value === undefined) continue;

        const type = Array.isArray(value) ? 'array'
            : value === null              ? 'null'
            : typeof value;

        if (type === 'object' || type === 'array') {
            xml += `${indent(depth)}<data key="${escapeAttr(key)}" type="${type}">${escapeText(JSON.stringify(value))}</data>\n`;
        } else if (type === 'null') {
            xml += `${indent(depth)}<data key="${escapeAttr(key)}" type="null" />\n`;
        } else if (type === 'boolean') {
            xml += `${indent(depth)}<data key="${escapeAttr(key)}" type="boolean">${value}</data>\n`;
        } else if (type === 'number') {
            xml += `${indent(depth)}<data key="${escapeAttr(key)}" type="number">${value}</data>\n`;
        } else {
            // string
            xml += `${indent(depth)}<data key="${escapeAttr(key)}">${escapeText(String(value))}</data>\n`;
        }
    }
    return xml;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Serialize a graph snapshot to an XML string.
 *
 * Accepts either:
 *   - A GraphAbstract instance (calls .serialise() internally)
 *   - A plain snapshot: { nodes: [...], edges: [...] }
 *
 * @param {object} source — GraphAbstract instance or { nodes, edges } snapshot
 * @returns {string} Canonical XML string
 *
 * @example
 * import { GraphAbstract, serialize } from '@wity/graph-headless';
 *
 * const graph = new GraphAbstract();
 * graph.addNode({ uid: 'a', type: 'continuant', label: 'Idea' });
 * graph.addNode({ uid: 'b', type: 'occurant', label: 'Process' });
 * graph.addEdge({ srcUid: 'a', targetUid: 'b', type: 'default' });
 *
 * const xml = serialize(graph);
 */
function serialize(source) {
    const snapshot = typeof source.serialise === 'function'
        ? source.serialise()
        : source;

    const nodes = snapshot.nodes ?? [];
    const edges = snapshot.edges ?? [];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<wity-knowledge version="1">\n`;

    // ── Nodes ──────────────────────────────────────────────────────────────
    xml += `${indent(1)}<nodes>\n`;
    for (const node of nodes) {
        const dataXml = serializeData(node.data, 3);
        if (dataXml) {
            xml += `${indent(2)}<node${attr('uid', node.uid)}${attr('type', node.type)}${attr('label', node.label)}>\n`;
            xml += dataXml;
            xml += `${indent(2)}</node>\n`;
        } else {
            xml += `${indent(2)}<node${attr('uid', node.uid)}${attr('type', node.type)}${attr('label', node.label)} />\n`;
        }
    }
    xml += `${indent(1)}</nodes>\n`;

    // ── Edges ──────────────────────────────────────────────────────────────
    xml += `${indent(1)}<edges>\n`;
    for (const edge of edges) {
        const dataXml = serializeData(edge.data, 3);
        if (dataXml) {
            xml += `${indent(2)}<edge${attr('uid', edge.uid)}${attr('src', edge.srcUid)}${attr('target', edge.targetUid)}${attr('type', edge.type)}>\n`;
            xml += dataXml;
            xml += `${indent(2)}</edge>\n`;
        } else {
            xml += `${indent(2)}<edge${attr('uid', edge.uid)}${attr('src', edge.srcUid)}${attr('target', edge.targetUid)}${attr('type', edge.type)} />\n`;
        }
    }
    xml += `${indent(1)}</edges>\n`;

    xml += `</wity-knowledge>\n`;
    return xml;
}

/**
 * @file serializer/parse.js
 * Parse a wity-knowledge XML string into a plain snapshot: { version, nodes, edges }.
 *
 * Isomorphic: uses DOMParser in browser environments.
 * Node.js consumers call setXmlParser() once at startup with an @xmldom/xmldom
 * instance — keeping graph-headless free of any Node.js-only imports.
 *
 * @module serializer/parse
 */

// ─── DOM resolver ────────────────────────────────────────────────────────────

let _injectedParser = null;

/**
 * Inject an XML parser for environments where DOMParser is not globally available (Node.js).
 * Must be called before parse() in Node.js contexts.
 *
 * @param {{ parseFromString: (xml: string, mime: string) => Document }} parserInstance
 *
 * @example
 * import { DOMParser } from '@xmldom/xmldom';
 * import { setXmlParser } from '@wity/graph-headless';
 * setXmlParser(new DOMParser());
 */
function setXmlParser(parserInstance) {
    _injectedParser = parserInstance;
}

function getParser() {
    if (_injectedParser)                  return _injectedParser;
    if (typeof DOMParser !== 'undefined') return new DOMParser();
    throw new Error(
        '[wity-knowledge] No XML parser available. In Node.js, call setXmlParser() before parse().\n' +
        'Example: import { DOMParser } from "@xmldom/xmldom"; setXmlParser(new DOMParser());'
    );
}

// ─── Data parsing ────────────────────────────────────────────────────────────

/**
 * Parse <data> child elements into a plain object.
 * @param {Element} parentEl
 * @returns {object}
 */
function parseDataElements(parentEl) {
    const data = {};
    const children = parentEl.getElementsByTagName('data');
    for (let i = 0; i < children.length; i++) {
        const el = children[i];
        // Only process direct children (not nested data elements from JSON objects)
        if (el.parentNode !== parentEl) continue;

        const key  = el.getAttribute('key');
        if (!key) continue;

        const type = el.getAttribute('type') || 'string';
        const text = el.textContent ?? '';

        switch (type) {
            case 'number':
                data[key] = Number(text);
                break;
            case 'boolean':
                data[key] = text === 'true';
                break;
            case 'null':
                data[key] = null;
                break;
            case 'array':
            case 'object':
                try { data[key] = JSON.parse(text); }
                catch { data[key] = text; }
                break;
            default:
                data[key] = text;
        }
    }
    return data;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a wity-knowledge XML string into a snapshot.
 *
 * @param {string} xml — XML string produced by serialize()
 * @returns {{ version: number, nodes: object[], edges: object[] }}
 *
 * @example
 * import { parse } from '@wity/graph-headless';
 *
 * const snapshot = parse(xmlString);
 * // snapshot.nodes — [{ uid, type, label, data }, ...]
 * // snapshot.edges — [{ uid, srcUid, targetUid, type, data }, ...]
 *
 * // Hydrate into a GraphAbstract:
 * const graph = new GraphAbstract();
 * graph.hydrate(snapshot);
 */
function parse(xml) {
    const parser = getParser();
    const doc    = parser.parseFromString(xml, 'application/xml');

    const root = doc.documentElement;
    if (!root || root.tagName !== 'wity-knowledge') {
        throw new Error('[wity-knowledge] parse: root element must be <wity-knowledge>');
    }

    const version = Number(root.getAttribute('version') || 1);

    // ── Nodes ──────────────────────────────────────────────────────────────
    const nodes = [];
    const nodeEls = root.getElementsByTagName('node');
    for (let i = 0; i < nodeEls.length; i++) {
        const el = nodeEls[i];
        const node = {
            uid:   el.getAttribute('uid'),
            type:  el.getAttribute('type') || 'continuant',
            label: el.getAttribute('label') || '',
            data:  parseDataElements(el),
        };
        nodes.push(node);
    }

    // ── Edges ──────────────────────────────────────────────────────────────
    const edges = [];
    const edgeEls = root.getElementsByTagName('edge');
    for (let i = 0; i < edgeEls.length; i++) {
        const el = edgeEls[i];
        const edge = {
            uid:       el.getAttribute('uid'),
            srcUid:    el.getAttribute('src'),
            targetUid: el.getAttribute('target'),
            type:      el.getAttribute('type') || 'default',
            data:      parseDataElements(el),
        };
        edges.push(edge);
    }

    return { version, nodes, edges };
}

/**
 * BatchProcessor — sequential async task queue with configurable interval.
 *
 * Improvement over the existing RateLimitedQueue:
 *  - Async/await based (no setTimeout chaining)
 *  - Error isolation per task (one failure doesn't block the queue)
 *  - Observable state (size, busy)
 *  - Drainable (await drain())
 *  - Backwards-compatible: same enqueue() interface
 */
class BatchProcessor {
    #queue = [];
    #isProcessing = false;
    #interval;
    #drainResolvers = [];

    constructor(interval = 0) {
        this.#interval = interval;
    }

    /**
     * Add a task to the queue.
     * @param {Function} fn  Sync or async function
     * @returns {this}  Chainable
     */
    enqueue(fn) {
        this.#queue.push(fn);
        this.#process();
        return this;
    }

    /**
     * Returns a Promise that resolves when the queue is empty and idle.
     */
    drain() {
        if (!this.#isProcessing && this.#queue.length === 0) {
            return Promise.resolve();
        }
        return new Promise(resolve => this.#drainResolvers.push(resolve));
    }

    /** Number of pending tasks. */
    get size() { return this.#queue.length; }

    /** Whether the queue is actively processing. */
    get busy() { return this.#isProcessing; }

    /** Remove all pending tasks (does not stop the running task). */
    clear() { this.#queue = []; }

    async #process() {
        if (this.#isProcessing) return;
        this.#isProcessing = true;

        while (this.#queue.length > 0) {
            const fn = this.#queue.shift();
            try {
                await fn();
            } catch (e) {
                console.error('[BatchProcessor] Task error:', e);
            }
            if (this.#interval > 0 && this.#queue.length > 0) {
                await new Promise(r => setTimeout(r, this.#interval));
            }
        }

        this.#isProcessing = false;

        // Notify drain waiters
        const resolvers = this.#drainResolvers.splice(0);
        resolvers.forEach(r => r());
    }
}

exports.ActorRegistry = ActorRegistry;
exports.BatchProcessor = BatchProcessor;
exports.DEFAULT_LINK_TYPE = DEFAULT_LINK_TYPE;
exports.DEFAULT_NODE_TYPE = DEFAULT_NODE_TYPE;
exports.EventBus = EventBus;
exports.GraphAbstract = GraphAbstract;
exports.GraphCanvasState = GraphCanvasState;
exports.GraphStore = GraphStore;
exports.LINK_TYPES = LINK_TYPES;
exports.NODE_TYPES = NODE_TYPES;
exports.PanZoomState = PanZoomState;
exports.PlaceholderManager = PlaceholderManager;
exports.PresenceState = PresenceState;
exports.SelectionManager = SelectionManager;
exports.SessionLog = SessionLog;
exports.allPaths = allPaths;
exports.computeLayout = computeLayout;
exports.computeNodeLinkPath = computeNodeLinkPath;
exports.computeNodePosition = computeNodePosition;
exports.computePolylinePath = computePolylinePath;
exports.findCommonParent = findCommonParent;
exports.getActiveInputPorts = getActiveInputPorts;
exports.getAncestors = getAncestors;
exports.getChildren = getChildren;
exports.getDataSchema = getDataSchema;
exports.getDefaultInputPortId = getDefaultInputPortId;
exports.getDefaultOutputPortId = getDefaultOutputPortId;
exports.getDepth = getDepth;
exports.getDescendants = getDescendants;
exports.getEdgesOfNode = getEdgesOfNode;
exports.getFitToContent = getFitToContent;
exports.getIncomingEdges = getIncomingEdges;
exports.getLinkTypeConfig = getLinkTypeConfig;
exports.getNodeAtPoint = getNodeAtPoint;
exports.getNodeTypeConfig = getNodeTypeConfig;
exports.getNodesAroundPoint = getNodesAroundPoint;
exports.getNodesInRect = getNodesInRect;
exports.getOutgoingEdges = getOutgoingEdges;
exports.getOverlappingNodes = getOverlappingNodes;
exports.getPanTargetForNode = getPanTargetForNode;
exports.getParents = getParents;
exports.getPortDots = getPortDots;
exports.getPortSvgPos = getPortSvgPos;
exports.getRoots = getRoots;
exports.horizontalLinkPath = horizontalLinkPath;
exports.parse = parse;
exports.patchNodeType = patchNodeType;
exports.polylinePath = polylinePath;
exports.propagate = propagate;
exports.reachable = reachable;
exports.rectsOverlap = rectsOverlap;
exports.registerLinkType = registerLinkType;
exports.registerNodeType = registerNodeType;
exports.resolveOverlaps = resolveOverlaps;
exports.serialize = serialize;
exports.setXmlParser = setXmlParser;
exports.shortestPath = shortestPath;
exports.smoothPolylinePath = smoothPolylinePath;
//# sourceMappingURL=graph-headless.cjs.map
