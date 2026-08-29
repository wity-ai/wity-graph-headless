/**
 * @file serializer/parse.js
 * Parse a wity-graph XML string into a plain snapshot: { version, nodes, edges }.
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
export function setXmlParser(parserInstance) {
    _injectedParser = parserInstance;
}

function getParser() {
    if (_injectedParser)                  return _injectedParser;
    if (typeof DOMParser !== 'undefined') return new DOMParser();
    throw new Error(
        '[wity-graph] No XML parser available. In Node.js, call setXmlParser() before parse().\n' +
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
 * Parse a wity-graph XML string into a snapshot.
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
export function parse(xml) {
    const parser = getParser();
    const doc    = parser.parseFromString(xml, 'application/xml');

    const root = doc.documentElement;
    if (!root || root.tagName !== 'wity-graph') {
        throw new Error('[wity-graph] parse: root element must be <wity-graph>');
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
