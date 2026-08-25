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
export function polylinePath(points) {
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
export function smoothPolylinePath(points, tension = 0.5) {
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
export function computePolylinePath(edge, srcNode, targetNode, { smooth = false, tension = 0.5 } = {}) {
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
