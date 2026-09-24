const state = {user: null, csrf: null, family: null, scale: 1, x: 40, y: 40, drag: null, activePersonId: null, edgeStyle: localStorage.getItem('familyVaultEdgeStyle') || 'classic', viewMode: localStorage.getItem('familyVaultView') || 'organic'};
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char]));

async function api(url, options = {}) {
  const headers = {...(options.body ? {'Content-Type': 'application/json'} : {}), ...(options.headers || {})};
  if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
  const response = await fetch(url, {...options, headers});
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function notice(message) {
  const target = $('status');
  target.textContent = message;
  target.hidden = !message;
}

function displayName(person) {
  return person.display_name || [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' ');
}

function initials(person) {
  const letters = [person.first_name, person.last_name].filter(Boolean).map(part => part[0]);
  return (letters.join('') || '?').toUpperCase();
}

function svgEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]));
}

function nodeCardImage(person, genderColor, level) {
  const name = svgEscape(displayName(person));
  const birth = svgEscape(person.vital_events?.birth?.date || 'Unknown');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="60" viewBox="0 0 196 60"><rect x="1.5" y="1.5" width="193" height="57" rx="12" fill="#0f172a" stroke="${genderColor}" stroke-width="1.6"/><circle cx="26" cy="30" r="13" fill="${genderColor}" fill-opacity=".16" stroke="${genderColor}" stroke-width="1.4"/><path d="M26 22.5a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4zM15.6 40.4c0-4.4 5-7.4 10.4-7.4s10.4 3 10.4 7.4v1.4H15.6z" fill="${genderColor}"/><text x="48" y="27" fill="#f1f5f9" font-family="Segoe UI,Arial,sans-serif" font-size="12" font-weight="600">${name}</text><text x="48" y="42" fill="#8b93b8" font-family="Segoe UI,Arial,sans-serif" font-size="9.5">Born ${birth}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function year(person) {
  return person.birth_year ?? null;
}

const OVERLAY_IDS = ['sidePanel', 'reviewSheet'];

function show(id) {
  $(id).hidden = false;
  if (OVERLAY_IDS.includes(id)) $('overlayBackdrop').hidden = false;
}

function hide(id) {
  $(id).hidden = true;
  if (OVERLAY_IDS.includes(id) && OVERLAY_IDS.every(other => $(other).hidden)) $('overlayBackdrop').hidden = true;
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('familyVaultTheme', theme);
  $('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

// ---------- Session ----------
async function boot() {
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  try {
    const data = await api('/api/me');
    state.user = data.user;
    state.csrf = data.csrf_token;
    await enterVault();
  } catch {
    show('loginView');
  }
}

async function enterVault() {
  hide('loginView');
  show('vaultView');
  $('userName').textContent = state.user.display_name;
  const isAdmin = state.user.role === 'admin';
  $('reviewButton').hidden = !isAdmin;
  $('usersButton').hidden = !isAdmin;
  await loadFamily();
}

async function loadFamily() {
  state.family = await api('/api/family');
  const years = state.family.individuals.map(year).filter(Number.isInteger);
  const slider = $('yearSlider');
  slider.min = Math.min(...years, 1800);
  slider.max = Math.max(...years, new Date().getFullYear());
  slider.value = slider.max;
  renderTree();
}

// ---------- Knowledge-graph rendering ----------
let network = null;
let networkNodes = null;
let networkEdges = null;

function teardownNetwork() {
  if (networkNodes) networkNodes.clear();
  if (networkEdges) networkEdges.clear();
  if (network) network.destroy();
  network = null;
  networkNodes = null;
  networkEdges = null;
  state.svgOverlay = null;
  state.edgeAnimationMap = null;
  const container = $('treeCanvas');
  if (container) container.replaceChildren();
  state.scale = 1;
  state.x = 40;
  state.y = 40;
}


function computeDynamicGenerations(people, parentsOf) {
  const levels = new Map();
  const queue = [];
  people.forEach(person => {
    if (!(parentsOf.get(person.id) || []).length) {
      levels.set(person.id, 0);
      queue.push(person.id);
    }
  });
  while (queue.length) {
    const parentId = queue.shift();
    const parentLevel = levels.get(parentId);
    people.forEach(person => {
      if (!(parentsOf.get(person.id) || []).includes(parentId)) return;
      const nextLevel = parentLevel + 1;
      if (!levels.has(person.id) || levels.get(person.id) < nextLevel) {
        levels.set(person.id, nextLevel);
        queue.push(person.id);
      }
    });
  }
  people.forEach(person => { if (!levels.has(person.id)) levels.set(person.id, 0); });
  return levels;
}

// Builds shared couple/child lookup maps from the union records. Shared by
// computeLayout (for coordinates) and renderTree (for edge junction lookup)
// so both agree on the same coupleKey -> union.id mapping.
function buildUnionMaps(unions, people) {
  const partnerOf = new Map();
  const unionOfCouple = new Map();
  const childrenOf = new Map();
  unions.forEach(union => {
    const pids = (union.partners || []).map(p => p.individual_id).filter(Boolean);
    if (pids.length === 2) {
      const sorted = [...pids].sort();
      partnerOf.set(pids[0], pids[1]);
      partnerOf.set(pids[1], pids[0]);
      unionOfCouple.set(sorted.join('|'), union.id);
    }
    if (pids.length >= 1) {
      const coupleKey = [...pids].sort().join('|');
      const childIds = (union.children || [])
        .map(c => c.individual_id)
        .filter(cid => people.some(p => p.id === cid));
      if (childIds.length) {
        const existing = childrenOf.get(coupleKey) || [];
        childrenOf.set(coupleKey, [...new Set([...existing, ...childIds])]);
      }
    }
  });
  return {partnerOf, unionOfCouple, childrenOf};
}

// GEOMETRIC LAYOUT ENGINE FOR THE CLASSIC TREE VIEW
// Couples are stacked vertically (spouse directly below partner, like a
// traditional pedigree chart) rather than side by side. Each generation's
// children are centered beneath their parents' union point.
function computeLayout(people, unions, parentsOf, levels) {
  const positions = new Map();

    const COUPLE_HGAP = 160;    // Fixed spouse separation; the union midpoint sits 80px from either partner.
  const LEVEL_HEIGHT = 300;   // Fixed generation-row spacing.
  const NODE_WIDTH = 230;     // Base horizontal slot for a single column (matches card width)
  const SIBLING_GAP = 30;     // Single-node centers are 260px apart.
  const ROOT_GAP = 450;       // Minimum isolation buffer between independent branches.
  const MARGIN_X = 300;
  const MARGIN_Y = 60;

  const {partnerOf, unionOfCouple, childrenOf} = buildUnionMaps(unions, people);
  const visited = new Set();
  // Populated after root branches are ordered (below), but declared here so the
  // positionCouple closure can see the same Map once it is filled in — this lets
  // "which root branch does this spouse belong to, and how far right did that
  // branch land" bias sibling ordering before that branch has even been placed.
  const personRootIndex = new Map();
  const rankOfRoot = new Map();

  // Width required to lay out a couple (or single parent) and all descendants.
  const getSubtreeWidth = (bloodId, spouseId) => {
    const coupleKey = spouseId ? [bloodId, spouseId].sort().join('|') : bloodId;
    const kids = (childrenOf.get(coupleKey) || []).slice().sort();
    if (!kids.length) return NODE_WIDTH;
    let total = 0;
    kids.forEach(kidId => {
      const spouse = partnerOf.get(kidId);
      total += (spouse ? getSubtreeWidth(kidId, spouse) : NODE_WIDTH) + SIBLING_GAP;
    });
    return Math.max(total - SIBLING_GAP, NODE_WIDTH);
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
      positions.set(bloodId, {x: Math.round(centerX), y: Math.round(y)});
      if (spouseId) {
        // Spouse positioned horizontally to the right of the blood relation, same Y coordinate
        positions.set(spouseId, {x: Math.round(centerX + COUPLE_HGAP), y: Math.round(y)});
        const unionId = unionOfCouple.get(coupleKey);
        // Union node sits at the center X between the two spouses
        if (unionId) positions.set(unionId, {x: Math.round(centerX + COUPLE_HGAP / 2), y: Math.round(y)});
      }
      return;
    }

    // Only kids not yet positioned reserve horizontal slot space — one already placed
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
    const childAnchorX = spouseId ? centerX + COUPLE_HGAP / 2 : centerX;
    let currentX = childAnchorX - totalWidth / 2;
    const freshCenters = [];
    freshKids.forEach((kidId, idx) => {
      const width = widths[idx];
      const kidCenterX = currentX + width / 2;
      visited.add(kidId);
      const spouse = partnerOf.get(kidId);
      if (spouse) visited.add(spouse);
      positionCouple(kidId, spouse, kidCenterX, childY, ownRootIdx);
      freshCenters.push(positions.get(kidId)?.x ?? kidCenterX);
      currentX += width + SIBLING_GAP;
    });

    // Re-center over freshly placed children only — a sibling grafted in from
    // elsewhere keeps their own true position and must not skew this couple.
    const childGroupCenterX = freshCenters.length ? (Math.min(...freshCenters) + Math.max(...freshCenters)) / 2 : centerX;
    const resolvedCenterX = spouseId ? childGroupCenterX - COUPLE_HGAP / 2 : childGroupCenterX;
    positions.set(bloodId, {x: Math.round(resolvedCenterX), y: Math.round(y)});
    if (spouseId) {
      // Keep the couple's union midpoint aligned with the center of its child group.
      positions.set(spouseId, {x: Math.round(resolvedCenterX + COUPLE_HGAP), y: Math.round(y)});
      const unionId = unionOfCouple.get(coupleKey);
      if (unionId) positions.set(unionId, {x: Math.round(childGroupCenterX), y: Math.round(y)});
    }
  };

  // Root subtrees: people with no recorded parents. A married-in spouse who
  // also has no parents of their own is only a genuine root if their partner
  // has none either — otherwise they belong under the partner's real family
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
  // each other — this is what keeps a grafted child's line short instead of spanning
  // the full width of the canvas to reach a distant, unrelated-looking family group.
  const linkCount = (i, j) => {
    let count = 0;
    rootMembers[i].forEach(id => { if (rootMembers[j].has(partnerOf.get(id))) count += 1; });
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
  // blood descendants belongs to, before any positioning happens — positionCouple's
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
    const gap = previousIdx !== null && linkCount(previousIdx, idx) > 0 ? ROOT_GAP * 0.35 : ROOT_GAP;
    currentX += width + gap;
    previousIdx = idx;
  });

  return positions;
}

function renderTree() {
  if (!state.family || !window.vis) return;
  const query = $('searchInput').value.trim().toLowerCase();
  const targetYear = Number($('yearSlider').value);
  $('yearLabel').textContent = targetYear;
  const people = state.family.individuals.filter(person => !year(person) || year(person) <= targetYear);
  const matchedIds = new Set(query ? people.filter(person => displayName(person).toLowerCase().includes(query)).map(person => person.id) : people.map(person => person.id));
  const visible = new Set(people.map(person => person.id));
  const unions = state.family.unions || [];
  const parentsOf = new Map();
  people.forEach(person => {
    const explicitParents = person.parents || person.relationships?.parents || [];
    if (explicitParents.length) parentsOf.set(person.id, [...explicitParents].filter(id => visible.has(id)));
  });
  unions.forEach(union => {
    const parentIds = (union.partners || []).map(partner => partner.individual_id).filter(id => visible.has(id));
    (union.children || []).forEach(child => {
      const current = parentsOf.get(child.individual_id) || [];
      parentsOf.set(child.individual_id, [...new Set([...current, ...parentIds])]);
    });
  });
  const levels = computeDynamicGenerations(people, parentsOf);
  const componentById = new Map();
  const componentMembers = [];
  people.forEach(person => {
    if (componentById.has(person.id)) return;
    const component = componentMembers.length;
    const queue = [person.id];
    componentById.set(person.id, component);
    const members = [];
    while (queue.length) {
      const id = queue.shift();
      members.push(id);
      const neighbours = new Set([...(parentsOf.get(id) || [])]);
      people.forEach(candidate => { if ((parentsOf.get(candidate.id) || []).includes(id)) neighbours.add(candidate.id); });
      unions.forEach(union => {
        const partners = (union.partners || []).map(partner => partner.individual_id);
        if (partners.includes(id)) partners.forEach(neighbour => neighbours.add(neighbour));
      });
      neighbours.forEach(neighbour => {
        if (visible.has(neighbour) && !componentById.has(neighbour)) { componentById.set(neighbour, component); queue.push(neighbour); }
      });
    }
    componentMembers.push(members);
  });
  const personById = new Map(people.map(person => [person.id, person]));
  const {partnerOf, unionOfCouple} = buildUnionMaps(unions, people);
  const classicTree = state.viewMode === 'classic';
  const classicPositions = classicTree ? computeLayout(people, unions, parentsOf, levels) : null;
  const seedCounters = new Map();
  const initialPosition = person => {
    if (classicPositions?.has(person.id)) return classicPositions.get(person.id);
    const component = componentById.get(person.id) || 0;
    const index = seedCounters.get(component) || 0;
    seedCounters.set(component, index + 1);
    return {x: component * 900 + index * 300, y: (levels.get(person.id) || 0) * 300 + 60};
  };
  const nodes = [];
  const edges = [];
  const labeledEdge = edge => ({...edge, font: {size: 11, color: '#94a3b8', strokeWidth: 3, strokeColor: '#0f172a', align: 'horizontal'}});
  const names = ids => ids.map(id => displayName(personById.get(id))).filter(Boolean);
  const relationshipTooltip = personId => {
    const parentIds = parentsOf.get(personId) || [];
    const childIds = [...parentsOf.entries()].filter(([, parentIdsForChild]) => parentIdsForChild.includes(personId)).map(([childId]) => childId);
    const spouseIds = [...new Set(unions.flatMap(union => {
      const partnerIds = (union.partners || []).map(partner => partner.individual_id);
      return partnerIds.includes(personId) ? partnerIds.filter(id => id !== personId) : [];
    }))].filter(id => visible.has(id));
    const lines = [
      `Parents: ${names(parentIds).join(', ') || 'None recorded'}`,
      `Children: ${names(childIds).join(', ') || 'None recorded'}`,
      `Spouse: ${names(spouseIds).join(', ') || 'None recorded'}`
    ];
    return lines.map(line => escapeHtml(line)).join('<br>');
  };
  people.forEach(person => {
    const genderColor = person.gender === 'M' ? '#38bdf8' : person.gender === 'F' ? '#f472b6' : '#a78bfa';
    const birth = person.vital_events?.birth?.date || 'Unknown';
    nodes.push({
      id: person.id,
      label: '',
      title: relationshipTooltip(person.id),
      image: nodeCardImage(person, genderColor, levels.get(person.id)),
      brokenImage: nodeCardImage(person, genderColor, levels.get(person.id)),
      shape: 'image',
            margin: 12,
      widthConstraint: {minimum: 190, maximum: 250},
      heightConstraint: {minimum: 72},
      borderWidth: 2,
      borderWidthSelected: 3,
      color: {background: '#111827', border: genderColor, highlight: {background: '#1f2937', border: '#c4b5fd'}, hover: {background: '#1f2937', border: genderColor}},
      font: {color: '#f8fafc', size: 15, face: 'Inter, system-ui, sans-serif', bold: {color: '#fff', size: 16}},
      shadow: {enabled: true, color: `${genderColor}66`, size: 18, x: 0, y: 5},
      chosen: {node: (values, id, selected, hovering) => { values.shadow = true; values.shadowColor = genderColor; values.shadowSize = hovering || selected ? 24 : 14; values.borderWidth = selected ? 3 : 2; }},
      level: levels.get(person.id),
      opacity: !query || matchedIds.has(person.id) ? 1 : 0.12,
      ...(classicTree ? {...initialPosition(person), fixed: {x: true, y: true}} : {})
    });
  });
  const organicEdgePhysics = (edgeKind, parentIds = [], childId = null) => {
    if (classicTree) return {};
    const directFamily = edgeKind === 'union' || (edgeKind === 'parent' && parentIds.length > 0 && childId && (levels.get(childId) || 0) - Math.max(...parentIds.map(id => levels.get(id) || 0)) <= 1);
    return directFamily
      ? {length: 130, physics: true}
      : {length: 300, physics: true};
  };
    // Classic renders the direct spouse rail; Organic renders the two dashed parent-to-hub rails.
  if (classicTree) {
    const drawnCouples = new Set();
    unions.forEach(union => {
      const pids = (union.partners || []).map(partner => partner.individual_id).filter(id => visible.has(id));
      if (pids.length !== 2) return;
      const coupleKey = [...pids].sort().join('|');
      if (drawnCouples.has(coupleKey)) return;
      drawnCouples.add(coupleKey);
      edges.push(labeledEdge({from: pids[0], to: pids[1], edgeKind: 'union', label: 'Spouse', arrows: {to: {enabled: false}}, color: {color: '#d4a373', opacity: 0.85}, width: 1.6, dashes: [4, 4], smooth: {enabled: false}, ...organicEdgePhysics('union', pids)}));
    });
  }
  const parentGroups = new Map();
  parentsOf.forEach((parentIds, childId) => {
    const uniqueParents = [...new Set(parentIds)].filter(id => visible.has(id)).sort();
    if (!uniqueParents.length) return;
    const key = uniqueParents.join('|');
    if (!parentGroups.has(key)) parentGroups.set(key, {parentIds: uniqueParents, childIds: []});
    parentGroups.get(key).childIds.push(childId);
  });
    const childRelationLabel = (parentIds, childId) => {
    const child = personById.get(childId);
    if (!child) return '';
    return child.gender === 'M' ? 'Son' : child.gender === 'F' ? 'Daughter' : 'Child';
  };
  const invisibleClassicNode = (id, position, level) => nodes.push({id, label: '', shape: 'dot', size: 1, borderWidth: 0, color: {background: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)'}, level, ...position, physics: false, fixed: {x: true, y: true}, chosen: false});
  const invisibleOrganicHub = (id, level) => nodes.push({id, label: '', shape: 'dot', size: 0, opacity: 0, borderWidth: 0, color: {background: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)'}, level, physics: true, fixed: false, chosen: false});
  parentGroups.forEach(group => {
    const hasCouple = group.parentIds.length >= 2;
    const sourceId = group.parentIds[0];
    if (!classicTree) {
      if (hasCouple) {
        const hubId = `hub_${group.parentIds.join('_')}`;
        invisibleOrganicHub(hubId, Math.max(...group.parentIds.map(parentId => levels.get(parentId) || 0)) + 0.5);
        group.parentIds.forEach(parentId => edges.push(labeledEdge({from: parentId, to: hubId, edgeKind: 'marriage-hub', label: '', arrows: {to: {enabled: false}}, color: {color: '#d4a373', opacity: 0.85}, width: 1.6, dashes: [4, 4], smooth: {enabled: false}, length: 45, springConstant: 0.18, physics: true})));
        group.childIds.forEach(childId => edges.push(labeledEdge({from: hubId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: '#6366f1', highlight: '#a5b4fc'}, width: 2, smooth: {enabled: true, type: 'dynamic'}, length: 160, springConstant: 0.04, physics: true})));
      } else {
        group.childIds.forEach(childId => edges.push(labeledEdge({from: sourceId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: '#6366f1', highlight: '#a5b4fc'}, width: 2, smooth: {enabled: true, type: 'dynamic'}, ...organicEdgePhysics('parent', group.parentIds, childId)})));
      }
      return;
    }
    // Single child: connect directly, no need for a shared trunk to split.
    if (group.childIds.length < 2 && !hasCouple) {
      group.childIds.forEach(childId => edges.push(labeledEdge({from: sourceId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: '#6366f1', highlight: '#a5b4fc'}, width: 2, smooth: classicTree ? {enabled: false} : {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.5}})));
      return;
    }
    // Whether one parent or a couple: a single trunk drops from the parent (or the
    // couple's union point) to an invisible branch node, which then fans out to each
    // child. This shared-trunk shape (one line splitting into several) is what gives
    // the classic pedigree chart its T/Y-junction look, instead of independent lines
    // radiating straight from the parent to every child.
    const intersectionId = `union_${group.parentIds.join('_')}`;
    const branchId = `${intersectionId}_branch`;
    let unionPosition;
    if (hasCouple) {
      const coupleKey = [...group.parentIds].sort().join('|');
      const unionId = unionOfCouple.get(coupleKey);
      unionPosition = classicPositions?.get(unionId) || classicPositions?.get(intersectionId);
    } else {
      unionPosition = classicPositions?.get(sourceId);
    }
    // Use the most common child Y (not just the first child) as the branch row: a child
    // who is also a spouse grafted into a different branch elsewhere sits at that other
    // branch's row, not this family's true generational row, and must not skew the trunk.
    const childPositions = group.childIds.map(childId => classicPositions?.get(childId)).filter(Boolean);
    const yCounts = new Map();
    childPositions.forEach(pos => yCounts.set(pos.y, (yCounts.get(pos.y) || 0) + 1));
    let childLaneY = unionPosition?.y;
    let bestCount = 0;
    yCounts.forEach((count, y) => { if (count > bestCount) { bestCount = count; childLaneY = y; } });
    const branchPosition = unionPosition && childLaneY !== undefined ? {x: unionPosition.x, y: (unionPosition.y + childLaneY) / 2} : {};
    if (hasCouple) {
      invisibleClassicNode(intersectionId, unionPosition || {}, Math.max(...group.parentIds.map(parentId => levels.get(parentId) || 0)) + 0.5);
    }
    invisibleClassicNode(branchId, branchPosition, Math.max(...group.childIds.map(childId => levels.get(childId) || 0)) - 0.4);
    const trunkFrom = hasCouple ? intersectionId : sourceId;
    edges.push({from: trunkFrom, to: branchId, edgeKind: 'parent', arrows: {to: {enabled: false}}, label: '', color: {color: '#6366f1', opacity: 0.9}, width: 2, smooth: {enabled: false}});
    // Every child, including one grafted in elsewhere via marriage and sitting at a
    // different row, still branches off the same shared trunk point — this keeps the
    // single-trunk-splits-into-many look consistent no matter where the child lands.
    group.childIds.forEach(childId => edges.push(labeledEdge({from: branchId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: '#6366f1', highlight: '#a5b4fc'}, width: 2, smooth: {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.45}})));
  });
  if (query) {
    edges.forEach(edge => {
      const relevant = matchedIds.has(edge.from) || matchedIds.has(edge.to);
      edge.color = {color: relevant ? '#6366f1' : 'rgba(99, 102, 241, 0.12)', highlight: relevant ? '#a5b4fc' : 'rgba(99, 102, 241, 0.12)'};
      edge.opacity = relevant ? 1 : 0.12;
    });
  }
  if (state.edgeStyle === 'moving-dots') {
    edges.filter(edge => edge.edgeKind === 'parent').forEach(edge => {
      edge.color = {color: 'rgba(0, 0, 0, 0)', highlight: 'rgba(0, 0, 0, 0)', hover: 'rgba(0, 0, 0, 0)'};
      edge.width = 0;
      edge.selectionWidth = 0;
      edge.arrows = {to: {enabled: false}};
    });
  }
  const container = $('treeCanvas');
  container.innerHTML = '';

  // Create overlay SVG for animated connections
  const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgOverlay.setAttribute('class', 'connection-overlay');
  svgOverlay.setAttribute('width', '100%');
  svgOverlay.setAttribute('height', '100%');
  svgOverlay.style.position = 'absolute';
  svgOverlay.style.top = '0';
  svgOverlay.style.left = '0';
  svgOverlay.style.pointerEvents = 'none';
  svgOverlay.style.zIndex = '1';
  container.style.position = 'relative';

  // Define gradients and styles for animated connections
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="familyArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M0 0 L8 4 L0 8" fill="none" stroke="#818cf8" stroke-width="1.5"></path>
    </marker>
    <style>
      .connection-overlay path.family-link.guide {
        fill: none;
        stroke: #4bcffa;
        stroke-width: 2.2;
        opacity: .72;
        stroke-linecap: round;
        filter: drop-shadow(0 0 3px rgba(75, 207, 250, .55));
      }
      .connection-overlay circle.link-dot {
        fill: #7ee0ff;
        filter: drop-shadow(0 0 4px #4bcffa);
      }
    </style>
  `;
  svgOverlay.appendChild(defs);

  state.svgOverlay = svgOverlay;
  state.edgeAnimationMap = new Map();

  networkNodes = new vis.DataSet(nodes);
  networkEdges = new vis.DataSet(edges);
  
  const networkConfig = {
    layout: {hierarchical: {enabled: false}},
    physics: classicTree ? {enabled: false} : {enabled: true, solver: 'barnesHut', barnesHut: {gravitationalConstant: -25000, centralGravity: 0.08, springLength: 220, springConstant: 0.03, damping: 0.09, avoidOverlap: 1}, stabilization: {enabled: true, iterations: 1000, fit: true}},
    nodes: {
      shape: 'image',
      borderWidth: 2,
      chosen: true,
      fixed: classicTree ? {x: true, y: true} : false
    },
    edges: {
      arrows: {to: {enabled: true, scaleFactor: 0.8}},
      // Classic mode: straight angular segments (traditional pedigree-chart look).
      // Organic mode: smooth cubic-Bezier curves.
      smooth: classicTree ? {enabled: false} : {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.5},
      font: {size: 11, color: '#94a3b8', strokeWidth: 3, strokeColor: '#0f172a', align: 'horizontal'},
      selectionWidth: 2,
      physics: false
    },
    interaction: {
      dragNodes: !classicTree,
      dragView: true,
      zoomView: true,
      navigationButtons: true,
      hover: true,
      multiselect: false
    },
    manipulation: {enabled: false}
  };
  
  network = new vis.Network(container, {nodes: networkNodes, edges: networkEdges}, networkConfig);
  
  if (classicTree) {
    // STEP B: After rendering, lock everything and disable any remaining dynamic behavior
    network.once('afterDrawing', () => {
      requestAnimationFrame(() => {
        // Fit view to all nodes
        network.fit({animation: false, nodes: people.map(person => person.id), positioning: {padding: 80}});
        const view = network.getViewPosition();
        network.moveTo({position: view, scale: Math.max(network.getScale(), 0.82), animation: false});
        
        // STEP C: Disable physics ENTIRELY after initial layout to prevent edge motion
        network.setOptions({physics: {enabled: false}});
      });
    });
  } else {
    // Organic mode: keep physics for dynamic layout
    network.setOptions({physics: {enabled: true}});
  }
  container.appendChild(svgOverlay);
  const syncConnectorPositions = () => {};
    const animateConnections = () => {
    if (!state.svgOverlay || state.edgeStyle !== 'moving-dots') return;
    state.svgOverlay.querySelectorAll('path.family-link, circle.link-dot, animateMotion').forEach(el => el.remove());
    
    const positions = network.getPositions();
    const toScreen = (pos) => network.canvasToDOM(pos);
    
    edges.filter(edge => edge.edgeKind === 'parent').forEach((edge, idx) => {
      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) return;
      
      const fromScreen = toScreen(fromPos);
      const toScreen_pos = toScreen(toPos);
      
      // Compute control points for cubic Bezier
      const dx = toScreen_pos.x - fromScreen.x;
      const dy = toScreen_pos.y - fromScreen.y;
      const bend = Math.max(20, Math.min(100, Math.abs(dy) * 0.3));
      const c1 = {x: fromScreen.x, y: fromScreen.y + bend};
      const c2 = {x: toScreen_pos.x, y: toScreen_pos.y - bend};
      
      const pathData = `M${fromScreen.x} ${fromScreen.y} C${c1.x} ${c1.y},${c2.x} ${c2.y},${toScreen_pos.x} ${toScreen_pos.y}`;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', 'family-link guide');
      path.setAttribute('id', `path-${idx}`);
      state.svgOverlay.appendChild(path);
      
      // Create animated dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'link-dot');
      dot.setAttribute('r', '4');
      dot.setAttribute('id', `dot-${idx}`);
      
      const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
      animate.setAttribute('dur', '2s');
      animate.setAttribute('repeatCount', 'indefinite');
      animate.setAttribute('path', pathData);
      dot.appendChild(animate);
      state.svgOverlay.appendChild(dot);
    });
  };


      network.on('stabilizationIterationsDone', () => {
    if (!classicTree) network.setOptions({physics: {enabled: false}});
    syncConnectorPositions();
    animateConnections();
  });
  network.on('dragStart', () => {
    if (classicTree) return;
    network.setOptions({physics: {enabled: true}});
  });
  network.on('dragEnd', () => {
    if (classicTree) return;
    setTimeout(() => network?.setOptions({physics: {enabled: false}}), 400);
  });
  network.on('afterDrawing', () => animateConnections());
  network.on('zoom', () => animateConnections());
  network.on('dragEnd', () => animateConnections());
  network.on('dragEnd', async event => {
    const positions = {};
    (event.nodes || []).forEach(id => {
      if (personById.has(id)) {
        const point = network.getPositions([id])[id];
        positions[id] = {x: Math.round(point.x), y: Math.round(point.y)};
      }
    });
    syncConnectorPositions();
    animateConnections();
    if (!Object.keys(positions).length) return;
    try {
      await api('/api/family/positions', {method: 'PATCH', body: JSON.stringify({positions})});
      Object.entries(positions).forEach(([id, position]) => { const person = personById.get(id); person.position = position; });
    } catch (error) {
      notice(`Could not save layout: ${error.message}`);
    }
  });
  network.on('doubleClick', event => {
    const personId = (event.nodes || []).find(id => personById.has(id));
    if (personId) openPanel(personById.get(personId));
  });
  if (query && matchedIds.size) {
    network.once('afterDrawing', () => network.focus([...matchedIds][0], {scale: 0.9, animation: {duration: 650, easingFunction: 'easeInOutQuad'}}));
  }
  notice(query ? `${matchedIds.size} match${matchedIds.size === 1 ? '' : 'es'} highlighted.` : `${people.length} family member${people.length === 1 ? '' : 's'} shown.`);
}

// ---------- Side panel: view / add / edit ----------
function field(label, name, value = '', type = 'text', wide = false, placeholder = '') {
  return `<label class="${wide ? 'wide' : ''}">${label}<input name="${name}" value="${escapeHtml(value)}" type="${type}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

// Relationship phrasing adapts to the selected gender, e.g. "Son of" vs "Daughter of".
function relationshipLabels(gender) {
  if (gender === 'M') return {child_of: 'Son of', parent_of: 'Father of', spouse_of: 'Husband of'};
  if (gender === 'F') return {child_of: 'Daughter of', parent_of: 'Mother of', spouse_of: 'Wife of'};
  return {child_of: 'Child of', parent_of: 'Parent of', spouse_of: 'Spouse of'};
}

function relationshipOptionsHtml(gender, isEdit) {
  const labels = relationshipLabels(gender);
  const keepOption = isEdit ? '<option value="keep">No change</option>' : '';
  return `${keepOption}
    <option value="new_root">No known parents / start a branch</option>
    <option value="child_of">${labels.child_of} \u2026 (select the parents below)</option>
    <option value="parent_of">${labels.parent_of} \u2026 (select a child below)</option>
    <option value="spouse_of">${labels.spouse_of} \u2026 (select a spouse below)</option>`;
}

function relativeOptionsHtml(excludeId) {
  return state.family.individuals
    .filter(candidate => candidate.id !== excludeId)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map(candidate => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(displayName(candidate))}</option>`)
    .join('');
}

function parentGroupOptionsHtml(selectedIds = []) {
  const people = new Map(state.family.individuals.map(person => [person.id, person]));
  return (state.family.unions || [])
    .filter(union => union.partners?.length >= 2)
    .map(union => union.partners.map(partner => partner.individual_id).filter(id => people.has(id)))
    .filter(ids => ids.length === 2)
    .map(ids => `<option value="${escapeHtml(ids.join(','))}" ${ids.every(id => selectedIds.includes(id)) ? 'selected' : ''}>${escapeHtml(ids.map(id => people.get(id).first_name).join('-'))}</option>`)
    .join('');
}

function relationshipState(person) {
  const parents = new Set();
  const spouses = new Set();
  for (const union of state.family.unions || []) {
    const partnerIds = (union.partners || []).map(partner => partner.individual_id);
    if (partnerIds.includes(person.id)) partnerIds.filter(id => id !== person.id).forEach(id => spouses.add(id));
    if ((union.children || []).some(child => child.individual_id === person.id)) partnerIds.forEach(id => parents.add(id));
  }
  return {parents: [...parents], spouses: [...spouses]};
}

function openPanel(person = null) {
  state.activePersonId = person?.id || null;
  const birth = person?.vital_events?.birth || {};
  const death = person?.vital_events?.death || {};
  const culture = person?.cultural_metadata || {};
  const birthDateValue = birth.date && birth.date !== 'unknown' && birth.date !== 'private' ? birth.date : '';
  const migrationItems = (person?.migration_history || [])
    .map(entry => `<li>${escapeHtml(entry.year)} &middot; ${escapeHtml(entry.from)} &rarr; ${escapeHtml(entry.to)}${entry.reason ? ` (${escapeHtml(entry.reason)})` : ''}</li>`)
    .join('');
  const existingTags = (person?.tags || []).map(tag => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('');
  const contextBlock = person
    ? `${person.is_private ? '<p class="privacy-note">🔒 Marked private — sensitive details are hidden from non-admin members.</p>' : ''}
       ${existingTags ? `<div class="tag-badges">${existingTags}</div>` : ''}
       <div class="detail-grid">
         <div class="detail-card"><strong>Born</strong>${escapeHtml(birth.date || 'Unknown')}<br>${escapeHtml(birth.location || '')}</div>
         <div class="detail-card"><strong>Died</strong>${escapeHtml(death.date || '—')}<br>${escapeHtml(death.location || '')}</div>
         <div class="detail-card"><strong>Roots</strong>${escapeHtml(culture.native_village || 'Not recorded')}<br>${escapeHtml(culture.gotra_clan || '')}</div>
       </div>
       ${migrationItems ? `<h3>Migration</h3><ul>${migrationItems}</ul>` : ''}`
    : '';
  const gender = person?.gender || 'U';
  const relations = person ? relationshipState(person) : {parents: [], spouses: []};
  const storedRelations = person?.relationships || {};
  const parentIds = storedRelations.parents?.length ? storedRelations.parents : relations.parents;
  const spouseIds = storedRelations.spouses?.length ? storedRelations.spouses : relations.spouses;
  const relativeOptions = relativeOptionsHtml(person?.id);
  const relationshipFields = `
    <label class="wide">Relationship${person ? ' (editable anytime)' : ' *'}
      <select name="relationship" id="relationship">${relationshipOptionsHtml(gender, Boolean(person))}</select>
    </label>
    <label class="wide" id="relativeField" hidden><span id="relativeFieldLabel">Link to</span><select name="relative_id" id="relativeSelect"><option value="">Choose a family member</option>${relativeOptions}</select></label>
    <label class="wide" id="coParentField" hidden>Other parent (optional, links the pair together as a couple)<select name="co_parent_id" id="coParentSelect"><option value="">None / unknown</option>${relativeOptions}</select></label>
    <label class="wide" id="parentGroupField" hidden>Paired parents<select id="parentGroupSelect" name="parent_group" multiple size="3">${parentGroupOptionsHtml(parentIds)}</select></label>
    <p class="wide relationship-summary">Parents: ${escapeHtml(parentIds.map(id => state.family.individuals.find(candidate => candidate.id === id)?.first_name || id).join('-') || 'None')} · Spouses: ${escapeHtml(spouseIds.map(id => state.family.individuals.find(candidate => candidate.id === id)?.first_name || id).join(', ') || 'None')}</p>`;
  const deleteButton = person ? '<button type="button" class="danger" id="deleteButton" aria-label="Delete person" title="Delete person"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 11v5m4-5v5"/></svg></button>' : '';
  const reviewNote = state.user.role === 'admin'
    ? 'As an administrator, your changes apply to the tree immediately.'
    : 'Changes are reviewed by a family administrator before they update the tree.';

  $('sidePanelContent').innerHTML = `
    <p class="eyebrow">${person ? 'EDIT PROPOSAL' : 'NEW PERSON PROPOSAL'}</p>
    <h2>${person ? escapeHtml(displayName(person)) : 'Add a family member'}</h2>
    <p>${reviewNote}</p>
    ${contextBlock}
    <form id="personForm" class="form-grid">
      ${field('First name *', 'first_name', person?.first_name || '')}
      ${field('Middle name', 'middle_name', person?.middle_name || '')}
      ${field('Last name *', 'last_name', person?.last_name || '')}
      <label>Gender *
        <select name="gender" id="genderSelect">
          <option value="M" ${person?.gender === 'M' ? 'selected' : ''}>Male</option>
          <option value="F" ${person?.gender === 'F' ? 'selected' : ''}>Female</option>
          <option value="NB" ${person?.gender === 'NB' ? 'selected' : ''}>Non-binary</option>
          <option value="U" ${person?.gender === 'U' || !person ? 'selected' : ''}>Unknown / prefer not to say</option>
        </select>
      </label>
      ${field('Birth date', 'birth_date', birthDateValue, 'text', false, 'e.g. 1985 or 1985-04-12 (leave blank if unknown)')}
      ${field('Birth location', 'birth_location', birth.location || '')}
      ${relationshipFields}
      ${field('Death date', 'death_date', death.date || '')}
      ${field('Death location', 'death_location', death.location || '')}
      ${field('Native village', 'native_village', culture.native_village || '')}
      ${field('Gotra / clan', 'gotra_clan', culture.gotra_clan || '')}
      ${field('Community', 'community_caste', culture.community_caste || '')}
      ${field('Generation', 'generation', person?.generation || '')}
      ${field('Tags', 'tags', (person?.tags || []).join(', '), 'text', true, 'e.g. Verified, Needs research')}
      <label class="wide privacy-note">
        <input type="checkbox" name="is_private" ${person?.is_private ? 'checked' : ''} style="width:auto">
        Mark this person as private (hides sensitive details from non-admin members)
      </label>
      <label class="wide">Biographical notes<textarea name="biographical_notes">${escapeHtml(person?.biographical_notes || '')}</textarea></label>
      <div class="wide panel-actions flex flex-row items-center justify-between space-x-2 w-full mt-4">
        <button type="submit" aria-label="${state.user.role === 'admin' ? 'Save changes' : 'Submit for review'}" title="${state.user.role === 'admin' ? 'Save changes' : 'Submit for review'}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></button>
        ${deleteButton}
        <button type="button" class="secondary" id="cancelForm" aria-label="Cancel" title="Cancel"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <p id="formError" class="error wide" hidden></p>
    </form>
  `;
  const relationship = $('relationship');
  const relativeLabels = {child_of: 'Parent', parent_of: 'Child', spouse_of: 'Spouse'};
  const updateRelativeVisibility = () => {
    const isLinked = ['child_of', 'parent_of', 'spouse_of'].includes(relationship.value);
    $('relativeField').hidden = !isLinked;
    $('relativeFieldLabel').textContent = isLinked ? relativeLabels[relationship.value] : 'Link to';
    // A second parent only makes sense when declaring who this person's parent(s) are.
    $('coParentField').hidden = relationship.value !== 'child_of';
    $('parentGroupField').hidden = relationship.value !== 'child_of';
    if (relationship.value === 'child_of') {
      $('relativeField').hidden = true;
      $('coParentField').hidden = true;
    }
  };
  relationship.onchange = updateRelativeVisibility;
  $('parentGroupSelect').onchange = event => {
    const selected = [...event.target.selectedOptions][0]?.value?.split(',') || [];
    if (selected.length === 2) {
      $('relativeSelect').value = selected[0];
      $('coParentSelect').value = selected[1];
    }
  };
  updateRelativeVisibility();
  // Keep the relationship wording (Son of / Daughter of / ...) in sync with the chosen gender.
  $('genderSelect').onchange = event => {
    const current = relationship.value;
    relationship.innerHTML = relationshipOptionsHtml(event.target.value, Boolean(person));
    relationship.value = current;
  };
  $('cancelForm').onclick = () => hide('sidePanel');
  $('personForm').onsubmit = event => submitProposal(event, person);
  if (person) $('deleteButton').onclick = () => submitDeleteProposal(person);
  renderTree();
  show('sidePanel');
}

async function submitProposal(event, person) {
  event.preventDefault();
  const form = new FormData(event.target);
  const data = Object.fromEntries(form.entries());
  data.is_private = form.has('is_private');
  try {
    const result = await api('/api/proposals', {method: 'POST', body: JSON.stringify({kind: person ? 'edit' : 'add', target_id: person?.id, person: data})});
    hide('sidePanel');
    await loadFamily();
    if (result.status === 'approved') {
      notice(person ? 'Saved. The tree has been updated.' : `Added "${result.person_id}" to the tree.`);
    } else {
      notice(person ? 'Your edit was submitted for administrator review.' : `Your addition was submitted for review as "${result.person_id}".`);
    }
  } catch (error) {
    const target = $('formError');
    target.textContent = error.message;
    target.hidden = false;
  }
}

async function submitDeleteProposal(person) {
  const isAdmin = state.user.role === 'admin';
  const confirmMessage = isAdmin
    ? `Delete ${displayName(person)}? This applies immediately and cannot be undone.`
    : `Submit a proposal to delete ${displayName(person)}? An administrator must approve it.`;
  if (!confirm(confirmMessage)) return;
  try {
    const result = await api('/api/proposals', {method: 'POST', body: JSON.stringify({kind: 'delete', target_id: person.id})});
    hide('sidePanel');
    await loadFamily();
    notice(result.status === 'approved' ? `${displayName(person)} was deleted.` : 'Your deletion request was submitted for administrator review.');
  } catch (error) {
    notice(error.message);
  }
}

// ---------- Admin: review proposals ----------
function describeProposal(proposal) {
  if (proposal.kind === 'delete') return `delete · ${escapeHtml(proposal.target_id)}`;
  return `${escapeHtml(proposal.kind)} · ${escapeHtml(proposal.target_id || proposal.payload.id)}`;
}

async function openReviews() {
  try {
    const data = await api('/api/proposals');
    const content = data.proposals.length
      ? data.proposals
          .map(
            proposal => `
        <article class="proposal">
          <strong>${describeProposal(proposal)}</strong>
          <p>Submitted by ${escapeHtml(proposal.proposer)}.</p>
          <pre>${escapeHtml(JSON.stringify(proposal.payload, null, 2))}</pre>
          <button data-review="${proposal.id}:approve">Approve</button>
          <button class="danger" data-review="${proposal.id}:reject">Reject</button>
        </article>`
          )
          .join('')
      : '<p>No pending proposals.</p>';
    $('reviewContent').innerHTML = `<p class="eyebrow">ADMINISTRATION</p><h2>Pending proposals</h2>${content}`;
    document.querySelectorAll('[data-review]').forEach(button => (button.onclick = () => review(button.dataset.review)));
    show('reviewSheet');
  } catch (error) {
    notice(error.message);
  }
}

async function review(value) {
  const [id, action] = value.split(':');
  try {
    await api(`/api/proposals/${id}/${action}`, {method: 'POST', body: JSON.stringify({})});
    await loadFamily();
    await openReviews();
    notice(`Proposal ${action}d.`);
  } catch (error) {
    notice(error.message);
  }
}

// ---------- Admin: user management ----------
function userField(label, name, value = '', type = 'text', placeholder = '') {
  return `<label>${label}<input name="${name}" value="${escapeHtml(value)}" type="${type}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

async function openUsers() {
  try {
    const data = await api('/api/admin/users');
    const rows = data.users
      .map(
        user => `
      <article class="proposal">
        <strong>${escapeHtml(user.display_name)}</strong> <span class="user-role">${escapeHtml(user.role)}</span>
        <p>Username: ${escapeHtml(user.username)}</p>
        <div class="panel-actions">
          <button data-role-toggle="${escapeHtml(user.username)}" class="secondary">${user.role === 'admin' ? 'Make member' : 'Make admin'}</button>
          <button data-reset-password="${escapeHtml(user.username)}" class="secondary">Reset password</button>
          ${user.username !== state.user.username ? `<button data-delete-user="${escapeHtml(user.username)}" class="danger">Delete</button>` : ''}
        </div>
      </article>`
      )
      .join('');
    $('reviewContent').innerHTML = `
      <p class="eyebrow">ADMINISTRATION</p>
      <h2>Family accounts</h2>
      <form id="newUserForm" class="form-grid">
        ${userField('Display name', 'display_name')}
        ${userField('Username', 'username', '', 'text', 'lowercase, letters/digits')}
        ${userField('Temporary password', 'password', '', 'password', 'at least 12 characters')}
        <label>Role<select name="role"><option value="member">Member</option><option value="admin">Admin</option></select></label>
        <button type="submit">Create account</button>
        <p id="userFormError" class="error" hidden></p>
      </form>
      <h3>Existing accounts</h3>
      ${rows || '<p>No accounts yet.</p>'}
    `;
    $('newUserForm').onsubmit = submitNewUser;
    document.querySelectorAll('[data-role-toggle]').forEach(button => (button.onclick = () => toggleRole(button.dataset.roleToggle)));
    document.querySelectorAll('[data-reset-password]').forEach(button => (button.onclick = () => resetPassword(button.dataset.resetPassword)));
    document.querySelectorAll('[data-delete-user]').forEach(button => (button.onclick = () => deleteUserAccount(button.dataset.deleteUser)));
    show('reviewSheet');
  } catch (error) {
    notice(error.message);
  }
}

async function submitNewUser(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const data = Object.fromEntries(form.entries());
  try {
    await api('/api/admin/users', {method: 'POST', body: JSON.stringify(data)});
    await openUsers();
    notice('Account created.');
  } catch (error) {
    const target = $('userFormError');
    target.textContent = error.message;
    target.hidden = false;
  }
}

async function toggleRole(username) {
  const users = (await api('/api/admin/users')).users;
  const current = users.find(user => user.username === username);
  const role = current.role === 'admin' ? 'member' : 'admin';
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, {method: 'PATCH', body: JSON.stringify({role})});
    await openUsers();
    notice(`${username} is now a ${role}.`);
  } catch (error) {
    notice(error.message);
  }
}

async function resetPassword(username) {
  const password = prompt(`Enter a new password for ${username} (at least 12 characters):`);
  if (!password) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, {method: 'PATCH', body: JSON.stringify({password})});
    notice(`Password updated for ${username}.`);
  } catch (error) {
    notice(error.message);
  }
}

async function deleteUserAccount(username) {
  if (!confirm(`Delete the account for ${username}? This cannot be undone.`)) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, {method: 'DELETE'});
    await openUsers();
    notice(`${username} was deleted.`);
  } catch (error) {
    notice(error.message);
  }
}

// vis-network owns node dragging, canvas panning, and zooming.
function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function closeExportMenu() {
  $('exportDropdownMenu').classList.add('hidden');
  $('exportDropdownBtn').setAttribute('aria-expanded', 'false');
}

function triggerSvgExport() {
  if (!network || !networkNodes) return notice('The tree is still rendering.');
  const positions = network.getPositions();
  const nodes = networkNodes.get();
  const edges = networkEdges?.get() || [];
  const points = Object.values(positions);
  const minX = Math.min(...points.map(point => point.x), 0) - 140;
  const minY = Math.min(...points.map(point => point.y), 0) - 60;
  const maxX = Math.max(...points.map(point => point.x), 0) + 140;
  const maxY = Math.max(...points.map(point => point.y), 0) + 60;
  const lineMarkup = edges.map(edge => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    return from && to ? `<line x1="${from.x - minX}" y1="${from.y - minY}" x2="${to.x - minX}" y2="${to.y - minY}" stroke="#818cf8" stroke-width="2" opacity=".8"/>` : '';
  }).join('');
  const nodeMarkup = nodes.filter(node => positions[node.id] && node.label).map(node => {
    const point = positions[node.id];
    return `<g transform="translate(${point.x - minX},${point.y - minY})"><rect x="-98" y="-30" width="196" height="60" rx="12" fill="#0f172a" stroke="#818cf8" stroke-width="1.6"/><text x="-82" y="4" fill="#f1f5f9" font-family="Arial,sans-serif" font-size="12">${svgEscape(node.label)}</text></g>`;
  }).join('');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX}" height="${maxY - minY}" viewBox="0 0 ${maxX - minX} ${maxY - minY}"><rect width="100%" height="100%" fill="#06070f"/>${lineMarkup}${nodeMarkup}</svg>`;
  downloadBlob(svgContent, 'family_tree_vault.svg', 'image/svg+xml;charset=utf-8');
  closeExportMenu();
}

function triggerPngExport() {
  const canvas = $('treeCanvas')?.querySelector('canvas');
  if (!canvas) return notice('The tree is still rendering.');
  const link = document.createElement('a');
  link.download = 'family_tree_snapshot.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  closeExportMenu();
}

async function triggerGedcomExport() {
  try {
    const response = await fetch('/api/export/gedcom');
    if (!response.ok) throw new Error('GEDCOM export requires administrator access.');
    downloadBlob(await response.text(), 'family_vault.ged', 'text/vnd.familysearch.gedcom');
  } catch (error) {
    notice(error.message);
  }
  closeExportMenu();
}

function triggerPumlExport() {
  const people = state.family?.individuals || [];
  const unions = state.family?.unions || [];
  const lines = ['@startuml', 'hide circle', 'skinparam classAttributeIconSize 0'];
  people.forEach(person => lines.push(`class "${displayName(person).replace(/"/g, '\\\"')}" as ${person.id.replace(/[^A-Za-z0-9_]/g, '_')}`));
  unions.forEach(union => {
    const partners = (union.partners || []).map(partner => partner.individual_id).filter(Boolean);
    if (partners.length > 1) lines.push(`${partners[0].replace(/[^A-Za-z0-9_]/g, '_')} -- ${partners[1].replace(/[^A-Za-z0-9_]/g, '_')} : spouse`);
    (union.children || []).forEach(child => partners.forEach(parent => lines.push(`${parent.replace(/[^A-Za-z0-9_]/g, '_')} --> ${child.individual_id.replace(/[^A-Za-z0-9_]/g, '_')} : parent`)));
  });
  lines.push('@enduml');
  downloadBlob(lines.join('\n'), 'family_tree_vault.puml', 'text/plain;charset=utf-8');
  closeExportMenu();
}

// ---------- Wiring ----------
$('loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const data = await api('/api/login', {method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries()))});
    state.user = data.user;
    state.csrf = data.csrf_token;
    await enterVault();
  } catch (error) {
    $('loginError').textContent = error.message;
    $('loginError').hidden = false;
  }
};
$('logoutButton').onclick = async () => {
  await api('/api/logout', {method: 'POST'});
  state.user = null;
  state.csrf = null;
  hide('vaultView');
  show('loginView');
};
$('themeToggle').onclick = toggleTheme;
$('exportDropdownBtn').onclick = event => {
  event.stopPropagation();
  const menu = $('exportDropdownMenu');
  const hidden = menu.classList.toggle('hidden');
  $('exportDropdownBtn').setAttribute('aria-expanded', String(!hidden));
};
$('svgExportBtn').onclick = triggerSvgExport;
$('pngExportBtn').onclick = triggerPngExport;
$('existingGedcomBtn').onclick = triggerGedcomExport;
$('pumlExportBtn').onclick = triggerPumlExport;
document.addEventListener('click', event => {
  if (!$('exportMenuContainer').contains(event.target)) closeExportMenu();
});
$('edgeStyleSelect').value = state.edgeStyle;
$('edgeStyleSelect').onchange = event => {
  state.edgeStyle = event.target.value;
  localStorage.setItem('familyVaultEdgeStyle', state.edgeStyle);
  renderTree();
};
$('searchInput').oninput = renderTree;
$('yearSlider').oninput = renderTree;
function setViewMode(mode) {
  if (state.viewMode === mode && network) return;
  teardownNetwork();
  state.viewMode = mode;
  localStorage.setItem('familyVaultView', mode);
  ['organicView', 'classicView'].forEach(id => {
    const active = id === `${mode}View`;
    $(id).classList.toggle('active', active);
    $(id).setAttribute('aria-pressed', String(active));
  });
  renderTree();
}
$('organicView').onclick = () => setViewMode('organic');
$('classicView').onclick = () => setViewMode('classic');
setViewMode(state.viewMode);
$('resetView').onclick = () => {
  if (network) network.fit({animation: true});
};
$('addButton').onclick = () => openPanel();
$('reviewButton').onclick = openReviews;
$('usersButton').onclick = openUsers;
document.querySelectorAll('[data-close]').forEach(button => (button.onclick = () => hide(button.dataset.close)));
$('overlayBackdrop').onclick = () => OVERLAY_IDS.forEach(hide);
boot();
