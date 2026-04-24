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
export function getPortSvgPos(node, portId, getConfig) {
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
export function getPortDots(node, getConfig) {
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
export function getActiveInputPorts(node, allEdges, getConfig) {
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
export function getDefaultOutputPortId(type, getConfig) {
    const outputs = getConfig(type).ports?.outputs || [];
    return outputs[0]?.id ?? 'out';
}

/**
 * Returns the default input port id for a node type.
 */
export function getDefaultInputPortId(type, getConfig) {
    const inputs = getConfig(type).ports?.inputs || [];
    return inputs[0]?.id ?? 'in';
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _findPort(cfg, portId) {
    const all = [...(cfg.ports?.inputs || []), ...(cfg.ports?.outputs || [])];
    return all.find(p => p.id === portId) ?? null;
}
