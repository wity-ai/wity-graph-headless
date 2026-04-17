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

import { getNodeTypeConfig } from '../ontology/node-types.js';
import { getOverlappingNodes, resolveOverlaps } from './spatial.js';

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
export function computeNodePosition(node, nodeIdx, nodes, viewBox, options = {}) {
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
export function computeLayout(nodes, viewBox, options = {}) {
    let idx = 0;
    for (const node of nodes.values()) {
        computeNodePosition(node, idx++, nodes, viewBox, options);
    }
    return nodes;
}
