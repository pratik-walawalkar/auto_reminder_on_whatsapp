# Classic Tree Layout Algorithm

**Status:** Current implementation  
**Last updated:** 2026-09-25  
**Scope:** Geometric placement and width reservation for the vis-network classic tree view.

## Overview

The classic tree layout (`computeLayout()` in `static/app.js:286–514`) computes deterministic x/y coordinates for every person, spouse pair, union hub, and descendant group. It handles:

- **Conditional footprints:** Unmarried children reserve `NODE_WIDTH` (230px); married children reserve `NODE_WIDTH + COUPLE_HGAP` (490px).
- **Grafted cross-branch marriages:** Children already positioned in a different root branch are re-used by their spouse's family without reserving extra space.
- **Parent re-centering:** Couples are placed provisionally, then slid horizontally to sit centered over all their children—including those already positioned from previous branches.
- **Root branch ordering:** Roots are sorted greedily so connected branches sit adjacent, with tighter gaps (63px) between connected roots than unrelated roots (180px).

## Algorithm Steps

### 1. Union Mapping (`buildUnionMaps`)

Build three shared maps from the YAML data:
- `partnerOf`: map of person ID → spouse ID (bidirectional).
- `unionOfCouple`: map of sorted couple key → union node ID.
- `childrenOf`: map of couple key → array of child IDs.

### 2. Width Calculation (`getSubtreeWidth`)

Recursive width measurement:

```js
const getOwnWidth = spouseId =>
  spouseId ? NODE_WIDTH + COUPLE_HGAP : NODE_WIDTH;

const getSubtreeWidth = (bloodId, spouseId) => {
  const ownWidth = getOwnWidth(spouseId);
  const kids = childrenOf.get(coupleKey) || [];
  if (!kids.length) return ownWidth;
  let total = 0;
  kids.forEach(kidId => {
    const spouse = partnerOf.get(kidId);
    total += getSubtreeWidth(kidId, spouse) + SIBLING_GAP;
  });
  return Math.max(total - SIBLING_GAP, ownWidth);
};
```

Key insight: The returned width is the minimum bounding rectangle needed to lay out both the couple and all their descendants, accounting for the conditional footprint of each married child.

### 3. Recursive Couple Placement (`positionCouple`)

Place a blood person and their optional spouse, then recurse into children:

1. **Leaf nodes:** If no children, place the person at `centerX` (or adjusted for couple offset).
2. **Non-leaf nodes:**
   - Filter children: only "fresh" kids (not yet visited) reserve horizontal space.
   - Calculate child layout: center all children beneath the parent's union midpoint.
   - Recurse: place each child and their subtree.
   - **Re-center:** Slide the parent couple horizontally to sit centered over ALL children (including already-positioned grafted ones).

**Grafted child handling:** When a child was already positioned elsewhere (married into a different root branch), their union midpoint is included in the parent's centering calculation, but no extra width is reserved.

### 4. Root Branch Identification and Reordering

1. Find all roots (people with no recorded parents).
2. Detect cross-branch marriages: count spouse links and shared descendant members.
3. Greedily reorder roots so connected branches cluster together.
4. Record each root's rank (left-to-right position index) and assign blood-descendant tracking.

### 5. Root Placement

Place each root in order:

```js
const hasPlacedLink = orderedIdx
  .slice(0, orderedIdx.indexOf(idx) + 1)
  .some(placedIdx => linkCount(placedIdx, nextIdx) > 0);
const gap = hasPlacedLink ? ROOT_GAP * 0.35 : ROOT_GAP;
// ROOT_GAP = 180px, connected roots get 63px.
currentX += width + gap;
```

## Key Invariants

1. **No card overlap:** Married children reserve full couple footprint; sibling layout includes those widths.
2. **Cross-branch marriage handling:** Grafted children's real positions are read from `positions` map; their widths are not re-reserved.
3. **Parent centering includes grafted children:** Parents slide to center over both newly positioned and already-positioned descendants.
4. **Deterministic root ordering:** Greedy reordering is stable; same family data always produces the same branch sequence.
5. **Union midpoint alignment:** The couple's union node sits at the exact midpoint of their children's bounding box, enabling straight connector routing.

## Constants

| Constant | Value | Purpose |
| --- | --- | --- |
| `NODE_WIDTH` | 230px | Card width for a single person. |
| `COUPLE_HGAP` | 260px | Horizontal gap between spouse cards on the same generation. |
| `SIBLING_GAP` | 20px | Space between adjacent sibling subtrees. |
| `ROOT_GAP` | 180px | Space between unrelated root branches. |
| `ROOT_GAP * 0.35` | 63px | Space between connected root branches (same gap applies to all connected pairs). |
| `LEVEL_HEIGHT` | 300px | Vertical distance between generation rows. |
| `MARGIN_X` | 300px | Left margin for first root. |
| `MARGIN_Y` | 60px | Top margin. |

## Known Limitations

- **No collision detection between branches:** If a large subtree overflows into an adjacent branch's space, positions are not adjusted. Future work could add a post-pass collision detector.
- **Horizontal centering is exact, not bounded:** A parent can be placed far to the right if all their children are positioned far right, even if that wastes canvas space.
- **Single-pass layout:** Roots are placed left-to-right without backtracking or balancing. A multi-pass approach could further optimize density.

## Testing

The layout is verified by:
- **Unit tests:** `tests/test_api.py` checks source assertions for layout constants and logic presence.
- **Playwright smoke tests:** Live coordinates are sampled to confirm no overlaps and proper child centering.
- **Manual inspection:** Run `python server.py`, sign in, switch to classic view, and inspect node spacing and parent alignment.
