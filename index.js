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

// ─── Utilities ────────────────────────────────────────────────────────────────

export { BatchProcessor } from './utils/batch-processor.js';
