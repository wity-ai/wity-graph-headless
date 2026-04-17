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
export function rectsOverlap(a, b) {
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
export function getOverlappingNodes(node, allNodes) {
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
export function resolveOverlaps(
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
export function getNodesAroundPoint(x, y, nodes, xThreshold, yThreshold, excludeUids = []) {
    return nodes.filter(node => {
        if (excludeUids.includes(node.uid)) return false;
        return Math.abs(node.x - x) < xThreshold && Math.abs(node.y - y) < yThreshold;
    });
}
