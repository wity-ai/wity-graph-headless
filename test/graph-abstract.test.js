/**
 * GraphAbstract's edge lookups — what they return and in what order — pinned on the code as it was before the
 * per-node edge index (notes/26-10-11-per-node-edge-index.md), and held to by a randomised comparison against a
 * plain scan of every edge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphAbstract, reachable, propagate, shortestPath } from '../index.js';

const uids = (edges) => edges.map((e) => e.uid);
const chain = () => {
    const g = new GraphAbstract();
    for (const n of ['a', 'b', 'c', 'd']) g.addNode({ uid: n });
    g.addEdge({ srcUid: 'a', targetUid: 'b', type: 'x' });
    g.addEdge({ srcUid: 'a', targetUid: 'c', type: 'y' });
    g.addEdge({ srcUid: 'b', targetUid: 'c', type: 'x' });
    g.addEdge({ srcUid: 'c', targetUid: 'a', type: 'x' });
    g.addEdge({ srcUid: 'c', targetUid: 'c', type: 'loop' });
    return g;
};

test('lookups: by direction and type, in insertion order; a self-loop is one edge', () => {
    const g = chain();
    assert.deepEqual(uids(g.getOutgoing('a')), ['x:a→b', 'y:a→c']);
    assert.deepEqual(uids(g.getOutgoing('a', 'x')), ['x:a→b']);
    assert.deepEqual(uids(g.getIncoming('c')), ['y:a→c', 'x:b→c', 'loop:c→c']);
    assert.deepEqual(uids(g.getEdgesOf('c')), ['y:a→c', 'x:b→c', 'x:c→a', 'loop:c→c']);
    assert.deepEqual(uids(g.getEdgesOf('c', 'x')), ['x:b→c', 'x:c→a']);
    assert.deepEqual(uids(g.getOutgoing('nobody')), []);
    assert.notEqual(g.getOutgoing('a'), g.getOutgoing('a'), 'a new array each call');
});

test('after changes: an update keeps its place and its ends, a removal and re-add moves to the end, a node takes its edges', () => {
    const g = chain();
    g.addEdge({ srcUid: 'a', targetUid: 'b', type: 'x', data: { w: 2 } });
    assert.deepEqual([uids(g.getOutgoing('a')), g.getOutgoing('a')[0].data], [['x:a→b', 'y:a→c'], { w: 2 }]);
    g.addEdge({ uid: 'x:a→b', srcUid: 'd', targetUid: 'd', type: 'x' });
    assert.deepEqual([g.getEdge('x:a→b').srcUid, uids(g.getOutgoing('d'))], ['a', []], 'an update ignores new ends');
    g.removeEdge('x:a→b');
    g.addEdge({ srcUid: 'a', targetUid: 'b', type: 'x' });
    assert.deepEqual(uids(g.getOutgoing('a')), ['y:a→c', 'x:a→b']);
    g.removeNode('c');
    assert.deepEqual([uids(g.getOutgoing('a')), uids(g.getIncoming('a')), uids(g.getEdgesOf('b'))], [['x:a→b'], [], ['x:a→b']]);
    assert.equal(g.addEdge({ srcUid: 'a', targetUid: 'gone' }), null);
});

test('hydrate and clone carry the edges as given, lookups included', () => {
    const g = chain();
    const h = new GraphAbstract();
    h.addNode({ uid: 'stale' }); h.addNode({ uid: 'other' }); h.addEdge({ srcUid: 'stale', targetUid: 'other' });
    h.hydrate(g.serialise());
    assert.deepEqual([uids(h.getOutgoing('stale')), uids(h.getEdgesOf('c'))], [[], uids(g.getEdgesOf('c'))]);
    const k = g.clone();
    k.removeEdge('y:a→c');
    assert.deepEqual([uids(k.getOutgoing('a')), uids(g.getOutgoing('a'))], [['x:a→b'], ['x:a→b', 'y:a→c']], 'a clone is its own');
    // a snapshot edge whose node is missing is kept, and found by its uids
    const m = new GraphAbstract();
    m.hydrate({ nodes: [{ uid: 'p', type: 't', label: '', data: {} }], edges: [{ uid: 'e1', srcUid: 'p', targetUid: 'ghost', type: 'z', data: {} }] });
    assert.deepEqual([uids(m.getOutgoing('p')), uids(m.getIncoming('ghost'))], [['e1'], ['e1']]);
});

test('randomised: every lookup equals a scan of every edge, through long sequences of changes', () => {
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const scan = (g, uid, dir, type) => g.getEdges().filter((e) => (dir === 'out' ? e.srcUid === uid : dir === 'in' ? e.targetUid === uid : e.srcUid === uid || e.targetUid === uid) && (type === undefined || e.type === type));
    for (let round = 0; round < 30; round++) {
        let g = new GraphAbstract();
        const nodes = Array.from({ length: 12 }, (_, i) => `n${i}`);
        for (let step = 0; step < 400; step++) {
            const op = rnd(10), a = nodes[rnd(12)], b = nodes[rnd(12)], type = ['p', 'q'][rnd(2)];
            if (op < 2) g.addNode({ uid: a });
            else if (op < 6) g.addEdge({ srcUid: a, targetUid: b, type, data: { s: step } });
            else if (op < 8) { const all = g.getEdges(); if (all.length) g.removeEdge(all[rnd(all.length)].uid); }
            else if (op < 9) g.removeNode(a);
            else if (rnd(4) === 0) { const h = new GraphAbstract(); h.hydrate(JSON.parse(JSON.stringify(g.serialise()))); g = rnd(2) ? h : g.clone(); }
            for (const n of nodes) for (const t of [undefined, 'p']) {
                assert.deepEqual(uids(g.getOutgoing(n, t)), uids(scan(g, n, 'out', t)));
                assert.deepEqual(uids(g.getIncoming(n, t)), uids(scan(g, n, 'in', t)));
                assert.deepEqual(uids(g.getEdgesOf(n, t)), uids(scan(g, n, 'both', t)));
            }
        }
    }
});

test('the algorithms over it give the same answers', () => {
    const g = chain();
    assert.deepEqual(reachable(g, 'a').sort(), ['b', 'c']);
    assert.deepEqual(propagate(g, 'a', { edgeTypes: ['x'] }).map((r) => r.uid), ['b', 'c']);
    assert.deepEqual(shortestPath(g, 'a', 'c', { edgeTypes: ['x'] }).path, ['a', 'b', 'c']);
    assert.deepEqual(g.reachable('a', 'x').map((n) => n.uid), ['b', 'c']);
});

import { GraphStore, getEdgesOfNode, getOutgoingEdges, getIncomingEdges } from '../index.js';

test('GraphStore: its lookups read its index and equal a scan, through adds, re-adds, removals and node removals', () => {
    let seed = 11;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const store = new GraphStore();
    const nodes = Array.from({ length: 8 }, (_, i) => `n${i}`);
    for (const uid of nodes) store.addNode({ uid, title: uid, x: 0, y: 0 });
    const map = () => new Map(store.getEdges().map((e) => [e.uid, e]));
    for (let step = 0; step < 300; step++) {
        const op = rnd(8), a = nodes[rnd(8)], b = nodes[rnd(8)];
        if (op < 4) store.addEdge({ srcUid: a, targetUid: b, forceUpdate: rnd(2) === 0 });
        else if (op < 6) { const all = store.getEdges(); if (all.length) store.removeEdge(all[rnd(all.length)].uid); }
        else if (op < 7 && store.getNode(a)) store.removeNode(a);
        else if (!store.getNode(a)) store.addNode({ uid: a, title: a, x: 0, y: 0 });
        const m = map();
        for (const n of nodes) {
            assert.deepEqual(uids(store.getOutgoingEdges(n)), uids(getOutgoingEdges(n, m)));
            assert.deepEqual(uids(store.getIncomingEdges(n)), uids(getIncomingEdges(n, m)));
            assert.deepEqual(uids(store.getEdgesOfNode(n)), uids(getEdgesOfNode(n, m)));
        }
    }
});
