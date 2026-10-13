# @wity/graph-headless

Pure state, layout, traversal, and geometry for directed graphs. Zero dependencies. No DOM coupling.

**[Full documentation → wity.ai/stack/knowledge-graph](https://www.wity.ai/stack/knowledge-graph/packages/graph-headless)**

---

The core layer of [wity-graph](https://github.com/wity-ai/wity-graph). Use standalone or pair with `@wity/graph-ui-compute` for DOM bindings and `@wity/graph-player` for temporal replay.

Built by [Wity AI](https://www.wity.ai)

## 0.3.0

- **Per-node edge index.** `GraphAbstract.getOutgoing` / `getIncoming` / `getEdgesOf` and `GraphStore`'s edge lookups
  read an index of each node's edges instead of scanning every edge: a traversal costs nodes + edges, not
  nodes × edges. Results and their order are as before (pinned by tests, and compared against a full scan).
- **`viewOf(graph, { node })`** — a read-only view of a graph through a filter on its nodes: only the nodes that
  pass, only the edges between them. The algorithms (`propagate`, `reachable`, `shortestPath`, `allPaths`) run over
  a view unchanged. A view reads the graph as it is at each call; views compose.
- **`ordered(edges)`** — edges in their stated order (`data.order`, then as added), for lines whose order matters.
- **`checkJoins(graph, rules)`** — the edges that join kinds of node their type may not join; a rule lists the
  allowed `pairs` of node types, or the types an edge may leave (`from`) and enter (`to`).
