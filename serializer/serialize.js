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
export function serialize(source) {
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
