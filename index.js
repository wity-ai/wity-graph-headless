/**
 * graph-headless — public API
 *
 * A headless, ontologically-grounded directed graph library.
 * Zero DOM dependencies — pure state, layout, traversal, and geometry.
 *
 * Layered architecture:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Rendering Layer  (DOM mutations + event binding only)   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  GraphCanvasState  (composed state: store + pan/zoom)    │
 *   │  Single source of truth for all computed canvas state.   │
 *   │  getTransform · getNodeScreenRect · getOverlayAnchor     │
 *   │  getPanTargetForNode · isNodeInViewport · screenToSvg    │
 *   ├──────────────────────────┬───────────────────────────────┤
 *   │  GraphStore              │  PanZoomState                 │
 *   │  (node/edge data+layout) │  (pan, zoom, coord math)      │
 *   ├──────────┬───────────────┴──────────────┬────────────────┤
 *   │  Layout  │  Traversal                   │  Geometry      │
 *   ├──────────┴──────────────────────────────┴────────────────┤
 *   │  Ontology  (node-types, link-types — BFO grounded)       │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  Actors & Session                                        │
 *   │  ActorRegistry · SessionLog · PresenceState              │
 *   │  Independent of graph structure; layered on top.         │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  EventBus  ·  BatchProcessor  (infrastructure)           │
 *   └──────────────────────────────────────────────────────────┘
 *
 * All traversal methods return node[] / edge[] (never uid[]) for consistency.
 * Callers needing UIDs only: result.map(n => n.uid)
 */

// ─── Core ─────────────────────────────────────────────────────────────────────

export { GraphStore }          from './core/graph-store.js';
export { EventBus }            from './core/event-bus.js';
export { SelectionManager }    from './core/selection-manager.js';
export { PlaceholderManager }  from './core/placeholder-manager.js';

// ─── Traversal ────────────────────────────────────────────────────────────────

export {
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
} from './core/graph-traversal.js';

// ─── Layout ───────────────────────────────────────────────────────────────────

export { computeLayout, computeNodePosition } from './layout/horizontal-tree.js';
export { rectsOverlap, getOverlappingNodes, resolveOverlaps, getNodesAroundPoint } from './layout/spatial.js';

// ─── Geometry ─────────────────────────────────────────────────────────────────

export { horizontalLinkPath, computeNodeLinkPath }                           from './geometry/link-path.js';
export { getPortSvgPos, getPortDots, getActiveInputPorts,
         getDefaultOutputPortId, getDefaultInputPortId }                     from './geometry/port-geometry.js';
export { getPanTargetForNode }                                               from './geometry/pan-target.js';

// Spatial point/rect queries — pure bounding-box math, no layout or traversal.
export { getNodeAtPoint, getNodesInRect }                                    from './core/geometry.js';

// ─── Pan/Zoom + Canvas ────────────────────────────────────────────────────────

export { PanZoomState }      from './core/pan-zoom-state.js';
export { GraphCanvasState }  from './core/graph-canvas-state.js';

// ─── Ontology ─────────────────────────────────────────────────────────────────

export {
    NODE_TYPES,
    DEFAULT_NODE_TYPE,
    getNodeTypeConfig,
    registerNodeType,
} from './ontology/node-types.js';

export {
    LINK_TYPES,
    DEFAULT_LINK_TYPE,
    getLinkTypeConfig,
    registerLinkType,
} from './ontology/link-types.js';

// ─── Actors & Session ─────────────────────────────────────────────────────────
// Independent of graph structure. Layered on top without modifying any core state.
//
// ActorRegistry  — lookup store mapping actorId strings to flexible metadata
//                  (nickname, color, avatar, type, etc.). Plain lookup, no reactivity.
//                  The graph layer carries only the opaque string IDs.
//
// SessionLog     — append-only event log. Auto-captures GraphStore mutations if a store
//                  is provided; also accepts external events via record() (cursors, etc.).
//                  Emits 'session:event' on every append.
//
// PresenceState  — live per-actor snapshot derived from session events.
//                  Maintains cursor positions (SVG space) + active selections per actor.
//                  Emits 'presence:updated' for real-time cursor/highlight rendering.

export { ActorRegistry }  from './core/actor-registry.js';
export { SessionLog }     from './core/session-log.js';
export { PresenceState }  from './core/presence-state.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

export { BatchProcessor } from './utils/batch-processor.js';
