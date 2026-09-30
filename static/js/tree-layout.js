function treeComputeLayout(people, unions, parentsOf, levels) {
  const positions = new Map();

  const COUPLE_HGAP = 260;    // Fixed spouse separation; the union midpoint sits 80px from either partner.
  const LEVEL_HEIGHT = 300;   // Fixed generation-row spacing.
  const NODE_WIDTH = 230;     // Base horizontal slot for a single column (matches card width)
  const SIBLING_GAP = 20;     // Compact gap between adjacent child subtrees.
  const ROOT_GAP = 180;       // Compact buffer between independent branches.
  const MARGIN_X = 300;
  const MARGIN_Y = 60;

  const {partnerOf, unionOfCouple, childrenOf} = treeBuildUnionMaps(unions, people);
  const visited = new Set();
  // Populated after root branches are ordered (below), but declared here so the
  // positionCouple closure can see the same Map once it is filled in Ã¢â‚¬â€ this lets
  // "which root branch does this spouse belong to, and how far right did that
  // branch land" bias sibling ordering before that branch has even been placed.
  const personRootIndex = new Map();
  const rankOfRoot = new Map();

    // Width required to lay out a couple (or single parent) and all descendants.
  // centerX is the union midpoint, so a couple's two cards occupy the complete
  // footprint instead of competing for the same single-card sibling slot.
  const getOwnWidth = spouseId => spouseId
    ? NODE_WIDTH + COUPLE_HGAP
    : NODE_WIDTH;
  const getSubtreeWidth = (bloodId, spouseId) => {
    const coupleKey = spouseId ? [bloodId, spouseId].sort().join('|') : bloodId;
    const kids = (childrenOf.get(coupleKey) || []).slice().sort();
    const ownWidth = getOwnWidth(spouseId);
    if (!kids.length) return ownWidth;
    let total = 0;
    kids.forEach(kidId => {
      const spouse = partnerOf.get(kidId);
      total += getSubtreeWidth(kidId, spouse) + SIBLING_GAP;
    });
    return Math.max(total - SIBLING_GAP, ownWidth);
  };

  // Places bloodId at (centerX, y), their spouse (if any) directly below,
  // then recurses into children centered beneath the couple's union point.
  // centerX is only a provisional placement: once children are laid out, this
  // couple is re-centered over the true midpoint of its own (freshly placed)
  // children so it sits exactly between them, like a hand-drawn pedigree chart,
  // rather than skewed toward whichever child happens to have a bigger subtree.
  // ownRootIdx identifies which root branch this whole subtree belongs to, so a
  // child married into a DIFFERENT root branch can be pulled toward whichever side
  // that other branch was placed on (see sortKeyFor below), shortening their
  // cross-branch connector instead of leaving it to cut across the whole canvas.
  const positionCouple = (bloodId, spouseId, centerX, y, ownRootIdx) => {
    let coupleKey = bloodId;
    if (spouseId) {
      coupleKey = [bloodId, spouseId].sort().join('|');
    }

    const ownRank = rankOfRoot.has(ownRootIdx) ? rankOfRoot.get(ownRootIdx) : 0;
    const sortKeyFor = id => {
      // Already positioned elsewhere (grafted in via marriage into a different
      // branch that was laid out first): use their real x so this ordering
      // matches their true location instead of an arbitrary alphabetical slot.
      if (visited.has(id) && positions.has(id)) return positions.get(id).x;
      const spouse = partnerOf.get(id);
      const spouseRoot = spouse !== undefined ? personRootIndex.get(spouse) : undefined;
      if (spouseRoot !== undefined && spouseRoot !== ownRootIdx && rankOfRoot.has(spouseRoot)) {
        // Cross-branch marriage: bias far enough to dominate normal centerX-based
        // ordering, signed so a spouse branch placed to the right pulls this child
        // right, and one placed to the left pulls this child left.
        return centerX + (rankOfRoot.get(spouseRoot) - ownRank) * 1e6;
      }
      return centerX;
    };
    // Order siblings by that bias so a child's cross-branch marriage shortens its
    // connector, instead of sitting in the middle by alphabetical accident.
    const kids = (childrenOf.get(coupleKey) || []).slice().sort().sort((a, b) => sortKeyFor(a) - sortKeyFor(b));
        if (!kids.length) {
      const primaryX = spouseId ? centerX - COUPLE_HGAP / 2 : centerX;
      positions.set(bloodId, {x: Math.round(primaryX), y: Math.round(y)});
      if (spouseId) {
        // centerX is the union midpoint; keep both cards inside the reserved slot.
        positions.set(spouseId, {x: Math.round(centerX + COUPLE_HGAP / 2), y: Math.round(y)});
        const unionId = unionOfCouple.get(coupleKey);
        if (unionId) positions.set(unionId, {x: Math.round(centerX), y: Math.round(y)});
      }
      return;
    }

    // Only kids not yet positioned reserve horizontal slot space Ã¢â‚¬â€ one already placed
    // elsewhere (grafted in via marriage) draws its own connector straight to wherever
    // it actually landed and must NOT leave a gap here, or its unvisited siblings would
    // be pushed off-center away from the trunk for a slot that renders nothing.
    const freshKids = kids.filter(kidId => !visited.has(kidId));
    let totalWidth = 0;
    const widths = freshKids.map(kidId => {
      const spouse = partnerOf.get(kidId);
      const w = spouse ? getSubtreeWidth(kidId, spouse) : NODE_WIDTH;
      totalWidth += w + SIBLING_GAP;
      return w;
    });
    totalWidth -= SIBLING_GAP;

    const childY = y + LEVEL_HEIGHT;
    // Children belong beneath the parent for a single node, or beneath the
    // midpoint of the couple for a side-by-side pair.
        const childAnchorX = centerX;
    let currentX = childAnchorX - totalWidth / 2;
        const childCenters = [];
    kids.forEach(kidId => {
      const spouse = partnerOf.get(kidId);
      const existingCenter = spouse
        ? positions.get(unionOfCouple.get([kidId, spouse].sort().join('|')))?.x
        : positions.get(kidId)?.x;
      if (existingCenter !== undefined) childCenters.push(existingCenter);
    });
    freshKids.forEach((kidId, idx) => {
      const width = widths[idx];
      const kidCenterX = currentX + width / 2;
      visited.add(kidId);
      const spouse = partnerOf.get(kidId);
      if (spouse) visited.add(spouse);
      positionCouple(kidId, spouse, kidCenterX, childY, ownRootIdx);
      const placedCenter = spouse
        ? positions.get(unionOfCouple.get([kidId, spouse].sort().join('|')))?.x ?? kidCenterX
        : positions.get(kidId)?.x ?? kidCenterX;
      childCenters.push(placedCenter);
      currentX += width + SIBLING_GAP;
    });

    // Center over all child unions, including grafted children already positioned
    // elsewhere, so cross-branch family groups remain visually connected.
    const childGroupCenterX = childCenters.length ? (Math.min(...childCenters) + Math.max(...childCenters)) / 2 : centerX;
    const primaryX = spouseId ? childGroupCenterX - COUPLE_HGAP / 2 : childGroupCenterX;
    positions.set(bloodId, {x: Math.round(primaryX), y: Math.round(y)});
    if (spouseId) {
      // Keep the couple's union midpoint aligned with the center of its child group.
      positions.set(spouseId, {x: Math.round(childGroupCenterX + COUPLE_HGAP / 2), y: Math.round(y)});
      const unionId = unionOfCouple.get(coupleKey);
      if (unionId) positions.set(unionId, {x: Math.round(childGroupCenterX), y: Math.round(y)});
    }
  };

  // Root subtrees: people with no recorded parents. A married-in spouse who
  // also has no parents of their own is only a genuine root if their partner
  // has none either Ã¢â‚¬â€ otherwise they belong under the partner's real family
  // and get attached when that subtree's recursion reaches them as a spouse.
  const roots = [];
  const rootSeen = new Set();
  people.forEach(person => {
    if (rootSeen.has(person.id) || visited.has(person.id)) return;
    if ((parentsOf.get(person.id) || []).length) return;
    const spouse = partnerOf.get(person.id);
    if (spouse && rootSeen.has(spouse)) return;
    if (spouse && (parentsOf.get(spouse) || []).length) return;
    roots.push([person.id, spouse || null]);
    rootSeen.add(person.id);
    if (spouse) rootSeen.add(spouse);
  });
  roots.sort((a, b) => a[0].localeCompare(b[0]));

  // Collect each root's blood-descendant ids (following childrenOf only, not spouses'
  // other marriages) so we can detect cross-branch marriages between two root families.
  const bloodDescendants = (bloodId, spouseId) => {
    const coupleKey = spouseId ? [bloodId, spouseId].sort().join('|') : bloodId;
    const members = new Set([bloodId]);
    if (spouseId) members.add(spouseId);
    const kids = childrenOf.get(coupleKey) || [];
    kids.forEach(kidId => {
      const spouse = partnerOf.get(kidId);
      bloodDescendants(kidId, spouse).forEach(id => members.add(id));
    });
    return members;
  };
  const rootMembers = roots.map(([bloodId, spouseId]) => bloodDescendants(bloodId, spouseId));

  // Reorder roots greedily so branches linked by a cross-branch marriage sit next to
  // each other Ã¢â‚¬â€ this is what keeps a grafted child's line short instead of spanning
  // the full width of the canvas to reach a distant, unrelated-looking family group.
      const linkCount = (i, j) => {
    let count = 0;
    rootMembers[i].forEach(id => {
      if (rootMembers[j].has(partnerOf.get(id))) count += 1;
      if (rootMembers[j].has(id)) count += 1;
    });
    return count;
  };
  const remaining = new Set(roots.map((_, idx) => idx));
  const orderedIdx = [];
  let current = 0;
  remaining.delete(current);
  orderedIdx.push(current);
  while (remaining.size) {
    let best = null;
    let bestScore = -1;
    remaining.forEach(candidate => {
      const score = Math.max(...orderedIdx.map(placed => linkCount(placed, candidate)));
      if (score > bestScore || (score === bestScore && (best === null || roots[candidate][0].localeCompare(roots[best][0]) < 0))) {
        bestScore = score;
        best = candidate;
      }
    });
    remaining.delete(best);
    orderedIdx.push(best);
    current = best;
  }

  // Record each root's final left-to-right rank and which root every one of its
  // blood descendants belongs to, before any positioning happens Ã¢â‚¬â€ positionCouple's
  // sibling-ordering bias (above) needs this to know where a spouse's OTHER branch
  // will eventually land, even though that branch may be positioned later or earlier.
  orderedIdx.forEach((idx, rank) => {
    rankOfRoot.set(idx, rank);
    rootMembers[idx].forEach(id => personRootIndex.set(id, idx));
  });

  let currentX = MARGIN_X;
  let previousIdx = null;
  orderedIdx.forEach(idx => {
    const [bloodId, spouseId] = roots[idx];
    visited.add(bloodId);
    if (spouseId) visited.add(spouseId);
    const width = getSubtreeWidth(bloodId, spouseId);
    positionCouple(bloodId, spouseId, currentX + width / 2, MARGIN_Y, idx);
    // Branches joined by a cross-branch marriage sit noticeably closer together than
    // wholly unrelated branches, like the reference layout keeps married-in families
    // near the household they married into instead of spread evenly across the canvas.
        const currentRank = orderedIdx.indexOf(idx);
    const nextIdx = orderedIdx[currentRank + 1];
    const nextHasPlacedLink = nextIdx !== undefined && orderedIdx
      .slice(0, currentRank + 1)
      .some(placedIdx => linkCount(placedIdx, nextIdx) > 0);
    const gap = nextHasPlacedLink ? ROOT_GAP * 0.35 : ROOT_GAP;
    currentX += width + gap;
    previousIdx = idx;
  });

  return positions;
}

