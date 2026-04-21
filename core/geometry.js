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
export function getNodeAtPoint(x, y, nodes, { exclude = [], padding = 0 } = {}) {
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
export function getNodesInRect(rx, ry, rw, rh, nodes) {
    const x2 = rx + rw;
    const y2 = ry + rh;
    return nodes.filter(n =>
        n.x        < x2 &&
        n.x + n.w  > rx &&
        n.y        < y2 &&
        n.y + n.h  > ry
    );
}
