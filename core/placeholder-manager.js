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

import { EventBus } from './event-bus.js';

// Proximity thresholds for auto-snap (px)
const SNAP_X_THRESHOLD = 300;
const SNAP_Y_THRESHOLD = 300;

export class PlaceholderManager extends EventBus {
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
