

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

function nodeCardImage(person, genderColor, level, themeColors) {
  const name = svgEscape(displayName(person));
  const birth = svgEscape(person.vital_events?.birth?.date || 'Unknown');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="60" viewBox="0 0 196 60"><rect x="1.5" y="1.5" width="193" height="57" rx="12" fill="${themeColors.nodeBackground}" stroke="${genderColor}" stroke-width="1.6"/><circle cx="26" cy="30" r="13" fill="${genderColor}" fill-opacity=".16" stroke="${genderColor}" stroke-width="1.4"/><path d="M26 22.5a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4zM15.6 40.4c0-4.4 5-7.4 10.4-7.4s10.4 3 10.4 7.4v1.4H15.6z" fill="${genderColor}"/><text x="48" y="27" fill="${themeColors.nodeText}" font-family="Segoe UI,Arial,sans-serif" font-size="12" font-weight="600">${name}</text><text x="48" y="42" fill="${themeColors.nodeMuted}" font-family="Segoe UI,Arial,sans-serif" font-size="9.5">Born ${birth}</text></svg>`;
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
  $('themeToggle').textContent = theme === 'dark' ? '\u{1F319}' : '\u2600\uFE0F';
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
  initializeAvatarInitials();
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
let themeRefreshPending = false;
let isShiftPressed = false;
let lastPointerNodeId = null;

function evaluateAndResetHighlight() {
  if (state.lineageHover) clearLineageHover();
}

window.addEventListener('keydown', event => {
  if (event.key === 'Shift') isShiftPressed = true;
});

window.addEventListener('keyup', event => {
  if (event.key === 'Shift') {
    isShiftPressed = false;
    evaluateAndResetHighlight();
  }
});

function getAncestorsRecursive(nodeId, dataset, visited = new Set()) {
  return lineageGetAncestorsRecursive(nodeId, dataset, visited);
}

function applyLineageHover(nodeId, people, unions, parentsOf) {
  return lineageApplyHover(nodeId, people, unions, parentsOf, {state, networkNodes, networkEdges, isShiftPressed, lastPointerNodeId});
}

function updateAnimatedConnectionOpacity() {
  return lineageUpdateAnimatedConnectionOpacity(state);
}

function clearLineageHover() {
  return lineageClearHover({state, networkNodes, networkEdges, isShiftPressed});
}
function getCurrentThemeStyle() {
  const activeTheme = document.documentElement.getAttribute('data-theme');
  return activeTheme === 'light' ? WORKSPACE_THEME_LIGHT : WORKSPACE_THEME_DARK;
}

const WORKSPACE_THEME_DARK = Object.freeze({
  background: '#0f172a', nodeBgMale: '#1e293b', nodeBorderMale: '#38bdf8', nodeBgFemale: '#1e293b', nodeBorderFemale: '#f472b6', edgeColor: '#94a3b8', textColor: '#f8fafc'
});
const WORKSPACE_THEME_LIGHT = Object.freeze({
  background: '#fdfbf7', nodeBgMale: '#eaf4fa', nodeBorderMale: '#2b769e', nodeBgFemale: '#faf0f4', nodeBorderFemale: '#b84d75', edgeColor: '#706357', textColor: '#2c2520'
});

function executeThemeCanvasRefresh() {
  if (!state.family || !network || themeRefreshPending) return;
  themeRefreshPending = true;
  requestAnimationFrame(() => {
    themeRefreshPending = false;
    const viewport = preserveNetworkViewport(network);
    teardownNetwork();
    renderTree();
    if (network && viewport) {
      const view = viewport.view;
      const scale = viewport.scale;
      network.moveTo({position: view, scale, animation: false});
    }
  });
}

function teardownNetwork() {
  resetTreeLifecycle({network, networkNodes, networkEdges, container: $('treeCanvas'), state});
  network = null;
  networkNodes = null;
  networkEdges = null;
}


function computeDynamicGenerations(people, parentsOf) {
  return treeComputeDynamicGenerations(people, parentsOf);
}

// Builds shared couple/child lookup maps from the union records. Shared by
// computeLayout (for coordinates) and renderTree (for edge junction lookup)
// so both agree on the same coupleKey -> union.id mapping.
function buildUnionMaps(unions, people) {
  return treeBuildUnionMaps(unions, people);
}

// GEOMETRIC LAYOUT ENGINE FOR THE CLASSIC TREE VIEW
// Couples are stacked vertically (spouse directly below partner, like a
// traditional pedigree chart) rather than side by side. Each generation's
// children are centered beneath their parents' union point.
function computeLayout(people, unions, parentsOf, levels) {
  return treeComputeLayout(people, unions, parentsOf, levels);
}

function focusSearchMatch(personId) {
  if (!network || !personId) return;
  const position = network.getPositions([personId])[personId];
  if (!position) return;
  network.moveTo({
    position,
    scale: 0.9,
    animation: {duration: 900, easingFunction: 'easeInOutCubic'}
  });
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
  const savedOrganicPositions = new Map(people.filter(person => person.position && Number.isFinite(person.position.x) && Number.isFinite(person.position.y)).map(person => [person.id, person.position]));
  const initialPosition = person => {
    if (!classicTree && savedOrganicPositions.has(person.id)) return savedOrganicPositions.get(person.id);
    if (classicPositions?.has(person.id)) return classicPositions.get(person.id);
    const component = componentById.get(person.id) || 0;
    const index = seedCounters.get(component) || 0;
    seedCounters.set(component, index + 1);
    // Organic mode starts as a wide constellation so physics refines the graph
    // without collapsing every family branch into the middle of the viewport.
    return {x: component * 1200 + index * 420, y: (levels.get(person.id) || 0) * 360 + 60};
  };
  const nodes = [];
  const edges = [];
  const labeledEdge = edge => ({...edge, font: {size: 11, color: document.documentElement.dataset.theme === 'light' ? '#706357' : '#94a3b8', strokeWidth: 3, strokeColor: document.documentElement.dataset.theme === 'light' ? '#fdfbf7' : '#0f172a', align: 'horizontal'}});
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
  const activeTheme = getCurrentThemeStyle();
  const isLightTheme = activeTheme === WORKSPACE_THEME_LIGHT;
    const relationshipColor = getComputedStyle(document.documentElement).getPropertyValue('--nb').trim();
  const themeColors = isLightTheme
    ? {nodeBackground: activeTheme.background, nodeText: activeTheme.textColor, nodeMuted: activeTheme.edgeColor, edge: activeTheme.edgeColor, edgeHighlight: '#4a3e72', dimEdge: 'rgba(112, 99, 87, 0.12)'}
    : {nodeBackground: activeTheme.background, nodeText: activeTheme.textColor, nodeMuted: '#8b93b8', edge: '#6366f1', edgeHighlight: '#a5b4fc', dimEdge: 'rgba(99, 102, 241, 0.12)'};
  people.forEach(person => {
    const genderColor = isLightTheme
      ? person.gender === 'M' ? activeTheme.nodeBorderMale : person.gender === 'F' ? activeTheme.nodeBorderFemale : '#675a8a'
      : person.gender === 'M' ? activeTheme.nodeBorderMale : person.gender === 'F' ? activeTheme.nodeBorderFemale : '#a78bfa';
    const personThemeColors = isLightTheme
      ? {...themeColors, nodeBackground: person.gender === 'M' ? activeTheme.nodeBgMale : person.gender === 'F' ? activeTheme.nodeBgFemale : '#f1ece4'}
      : {...themeColors, nodeBackground: activeTheme.nodeBgMale};
    const birth = person.vital_events?.birth?.date || 'Unknown';
    nodes.push({
      id: person.id,
      label: '',
      title: relationshipTooltip(person.id),
      image: nodeCardImage(person, genderColor, levels.get(person.id), personThemeColors),
      brokenImage: nodeCardImage(person, genderColor, levels.get(person.id), personThemeColors),
      shape: 'image',
            margin: 12,
      widthConstraint: {minimum: 190, maximum: 250},
      heightConstraint: {minimum: 72},
      borderWidth: 2,
      borderWidthSelected: 3,
      color: {background: themeColors.nodeBackground, border: genderColor, highlight: {background: themeColors.nodeBackground, border: themeColors.edgeHighlight}, hover: {background: themeColors.nodeBackground, border: genderColor}},
      font: {color: themeColors.nodeText, size: 15, face: 'Inter, system-ui, sans-serif', bold: {color: themeColors.nodeText, size: 16}},
      shadow: {enabled: true, color: isLightTheme ? 'rgba(42, 33, 27, 0.12)' : `${genderColor}66`, size: isLightTheme ? 10 : 18, x: 0, y: 5},
      chosen: {node: (values, id, selected, hovering) => { values.shadow = true; values.shadowColor = genderColor; values.shadowSize = hovering || selected ? 24 : 14; values.borderWidth = selected ? 3 : 2; }},
      level: levels.get(person.id),
      opacity: !query || matchedIds.has(person.id) ? 1 : 0.12,
      ...initialPosition(person),
      ...(classicTree ? {fixed: {x: true, y: true}} : {})
    });
  });
  treeBuildEdges({nodes, edges, classicTree, unions, visible, parentsOf, personById, levels, unionOfCouple, classicPositions, themeColors, relationshipColor, labeledEdge});

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
  svgOverlay.style.zIndex = '2';
  container.style.position = 'relative';

  // Define gradients and styles for animated connections
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  
  const overlayColors = document.documentElement.dataset.theme === 'light'
    ? {arrow: '#706357', line: '#706357', dot: themeColors.edge, glow: 'rgba(74, 62, 114, .18)'}
    : {arrow: '#818cf8', line: '#4bcffa', dot: themeColors.edge, glow: 'rgba(129, 140, 248, .55)'};
  defs.innerHTML = `
    <marker id="familyArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M0 0 L8 4 L0 8" fill="none" stroke="${overlayColors.arrow}" stroke-width="1.5"></path>
    </marker>
    <style>
      .connection-overlay path.family-link.guide {
        fill: none;
        stroke: ${overlayColors.line};
        stroke-width: 2.2;
        opacity: .72;
        stroke-linecap: round;
        filter: drop-shadow(0 0 3px ${overlayColors.glow});
      }
      .connection-overlay circle.link-dot {
        fill: ${overlayColors.dot};
        filter: drop-shadow(0 0 2px ${overlayColors.glow});
      }
    </style>
    `;
    svgOverlay.appendChild(defs);

    state.svgOverlay = svgOverlay;
  state.edgeAnimationMap = new Map();
  nodes.forEach(node => { node._lineageColor = node.color; });
  edges.forEach(edge => {
        edge._lineageColor = edge.color;
    edge._lineageFont = edge.font;
    edge._lineageOpacity = edge.opacity ?? 1;
    edge._lineageWidth = edge.width || 2;
    edge._lineageSelectionWidth = edge.selectionWidth || 2;
  });

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
      smooth: {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.5},
      font: {size: 11, color: themeColors.nodeMuted, strokeWidth: 3, strokeColor: isLightTheme ? '#fdfbf7' : '#0f172a', align: 'horizontal'},
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
        // Match the Reset view button's fit and zoom.
        network.fit({animation: false});
        
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
    const animateConnections = () => treeAnimateConnections({state, network, edges, personById, activeTheme, overlayColors, defs});


  treeBindInteractions({network, classicTree, state, personById, people, unions, parentsOf, query, matchedIds, api, notice, openPanel, applyLineageHover, clearLineageHover, focusSearchMatch, animateConnections, syncConnectorPositions, isShiftPressed: () => isShiftPressed});
  if (query && matchedIds.size) {
    network.once('afterDrawing', () => {
      const matchedId = [...matchedIds][0];
      applyLineageHover(matchedId, people, unions, parentsOf);
      focusSearchMatch(matchedId);
    });
  }

  notice(query ? `${matchedIds.size} match${matchedIds.size === 1 ? '' : 'es'} highlighted.` : `${people.length} family member${people.length === 1 ? '' : 's'} shown.`);
}

// ---------- Side panel: view / add / edit ----------
function field(label, name, value = '', type = 'text', wide = false, placeholder = '') {
  return panelField(label, name, value, type, wide, placeholder);
}

// Relationship phrasing adapts to the selected gender, e.g. "Son of" vs "Daughter of".
function relationshipLabels(gender) {
  return panelRelationshipLabels(gender);
}

function relationshipOptionsHtml(gender, isEdit) {
  return panelRelationshipOptionsHtml(gender, isEdit);
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
  return panelRelationshipState(person);
}

function openPanel(person = null) {
  return panelOpenPanel(person);
}

async function submitProposal(event, person) {
  return panelSubmitProposal(event, person);
}

async function submitDeleteProposal(person) {
  return panelSubmitDeleteProposal(person);
}
// ---------- Admin: review proposals ----------
function describeProposal(proposal) {
  return adminDescribeProposalView(proposal);
}

async function openReviews() {
  return adminOpenReviews();
}

async function review(value) {
  return adminReview(value);
}

function userField(label, name, value = '', type = 'text', placeholder = '') {
  return adminUserFieldView(label, name, value, type, placeholder);
}

async function openUsers() {
  return adminOpenUsers();
}

async function submitNewUser(event) {
  return adminSubmitNewUser(event);
}

async function toggleRole(username) {
  return adminToggleRole(username);
}

async function resetPassword(username) {
  return adminResetPassword(username);
}

async function deleteUserAccount(username) {
  return adminDeleteUserAccount(username);
}


// vis-network owns node dragging, canvas panning, and zooming.
function downloadBlob(content, filename, type) {
  return exportDownloadBlob(content, filename, type);
}

function closeExportMenu() {
  return exportCloseMenu();
}

function exportBounds() {
  const bounds = exportBoundsForCompatibility(network, networkNodes);
  return bounds ? {...bounds, edges: networkEdges?.get() || []} : null;
}

function exportBoundsForCompatibility(activeNetwork, nodesData) {
  return exportCalculateBounds(activeNetwork, nodesData);
}

function triggerSvgExport() {
  if (!network || !networkNodes) return notice('The tree is still rendering.');
  const bounds = exportBounds();
  if (!bounds) return notice('There are no nodes to export.');
  const {positions, nodes, edges, minX, minY, width, height} = bounds;
  const lineMarkup = edges.map(edge => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return '';
    const label = edge.label ? `<text x="${(from.x + to.x) / 2 - minX}" y="${(from.y + to.y) / 2 - minY - 5}" fill="#94a3b8" font-family="Segoe UI,Arial,sans-serif" font-size="11">${svgEscape(edge.label)}</text>` : '';
    return `<line x1="${from.x - minX}" y1="${from.y - minY}" x2="${to.x - minX}" y2="${to.y - minY}" stroke="#818cf8" stroke-width="2" opacity=".8"/>${label}`;
  }).join('');
  const nodeMarkup = nodes.filter(node => positions[node.id] && node.image).map(node => {
    const point = positions[node.id];
    return `<image href="${svgEscape(node.image)}" x="${point.x - minX - 98}" y="${point.y - minY - 30}" width="196" height="60" preserveAspectRatio="none"/>`;
  }).join('');
  const gridMarkup = `<path d="M0 24H${width} M24 0V${height}" stroke="#1e293b" stroke-width="1" opacity=".35"/>`;
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#06070f"/>${gridMarkup}${lineMarkup}${nodeMarkup}</svg>`;
  downloadBlob(svgContent, 'family_tree_vault.svg', 'image/svg+xml;charset=utf-8');
  closeExportMenu();
}

async function triggerPngExport() {
  if (!network || !networkNodes) return notice('The tree is still rendering.');
  const bounds = exportBounds();
  const canvas = $('treeCanvas')?.querySelector('canvas');
  if (!bounds || !canvas) return notice('The tree is still rendering.');
  const container = $('treeCanvas');
  const previous = {
    width: container.style.width,
    height: container.style.height,
    overflow: container.style.overflow,
    view: network.getViewPosition(),
    scale: network.getScale()
  };
  try {
    container.style.width = `${bounds.width}px`;
    container.style.height = `${bounds.height}px`;
    container.style.overflow = 'visible';
    network.setSize(`${bounds.width}px`, `${bounds.height}px`);
    network.moveTo({position: {x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2}, scale: 1, animation: false});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const activeCanvas = container.querySelector('canvas');
    const dataUrl = activeCanvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'family_tree_ultra_highres.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    notice(`PNG export failed: ${error.message}`);
  } finally {
    container.style.width = previous.width;
    container.style.height = previous.height;
    container.style.overflow = previous.overflow;
    network.setSize('100%', '100%');
    network.moveTo({position: previous.view, scale: previous.scale, animation: false});
    closeExportMenu();
  }
}

async function triggerLineageSnapshotExport(formatType = 'png') {
  if (!state.lineageHover?.vividNodes?.size) {
    closeExportMenu();
    return notice('Please hover or Shift-lock a lineage path first to export a snapshot.');
  }
  const format = ['png', 'svg', 'puml'].includes(formatType) ? formatType : 'png';
  const people = state.family?.individuals || [];
  const targetPerson = people.find(person => person.id === state.lineageHover.nodeId);
  const rawFullName = targetPerson ? `${targetPerson.first_name || ''}_${targetPerson.last_name || ''}` : '';
  const targetNameSlug = rawFullName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'unknown_ancestor';
  const filename = `lineage_snapshot_${targetNameSlug}.${format}`;
  const visibleIds = state.lineageHover.vividNodes;
  const visibleNodes = networkNodes?.get().filter(node => visibleIds.has(node.id)) || [];
  const visibleEdges = networkEdges?.get().filter(edge => state.lineageHover.vividEdges.has(edge.id)) || [];
  if (!visibleNodes.length) return notice('Please hover or Shift-lock a lineage path first to export a snapshot.');

  if (format === 'puml') {
    const names = new Map(people.map(person => [person.id, displayName(person).replace(/"/g, '\\\"')]));
    const lines = ['@startuml', 'hide circle', 'skinparam classAttributeIconSize 0'];
    visibleNodes.filter(node => names.has(node.id)).forEach(node => lines.push(`class "${names.get(node.id)}" as ${node.id.replace(/[^A-Za-z0-9_]/g, '_')}`));
    visibleEdges.forEach(edge => {
      if (names.has(edge.from) && names.has(edge.to)) lines.push(`${edge.from.replace(/[^A-Za-z0-9_]/g, '_')} --> ${edge.to.replace(/[^A-Za-z0-9_]/g, '_')}`);
    });
    lines.push('@enduml');
    downloadBlob(lines.join('\\n'), filename, 'text/plain;charset=utf-8');
    closeExportMenu();
    return;
  }

  const container = $('treeCanvas');
  const canvas = container?.querySelector('canvas');
  if (!network || !networkNodes || !networkEdges || !container || !canvas) return notice('The tree is still rendering.');
  const positions = network.getPositions(visibleNodes.map(node => node.id));
  const points = visibleNodes.map(node => positions[node.id]).filter(Boolean);
  const halfWidth = 100;
  const halfHeight = 38;
  const padding = 48;
  const minX = Math.floor(Math.min(...points.map(point => point.x - halfWidth)) - padding);
  const minY = Math.floor(Math.min(...points.map(point => point.y - halfHeight)) - padding);
  const maxX = Math.ceil(Math.max(...points.map(point => point.x + halfWidth)) + padding);
  const maxY = Math.ceil(Math.max(...points.map(point => point.y + halfHeight)) + padding);
  const previous = {width: container.style.width, height: container.style.height, overflow: container.style.overflow, view: network.getViewPosition(), scale: network.getScale(), nodeOpacity: new Map(networkNodes.get().map(node => [node.id, node.opacity])), edgeOpacity: new Map(networkEdges.get().map(edge => [edge.id, edge.opacity]))};
  try {
    networkNodes.update(networkNodes.get().filter(node => !visibleIds.has(node.id)).map(node => ({id: node.id, opacity: 0})));
    networkEdges.update(networkEdges.get().filter(edge => !state.lineageHover.vividEdges.has(edge.id)).map(edge => ({id: edge.id, opacity: 0})));
    container.style.width = `${maxX - minX}px`;
    container.style.height = `${maxY - minY}px`;
    container.style.overflow = 'visible';
    network.setSize(`${maxX - minX}px`, `${maxY - minY}px`);
    network.moveTo({position: {x: (minX + maxX) / 2, y: (minY + maxY) / 2}, scale: 1, animation: false});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (format === 'svg') {
      const svgNodes = visibleNodes.filter(node => positions[node.id] && node.image).map(node => `<image href="${svgEscape(node.image)}" x="${positions[node.id].x - minX - 98}" y="${positions[node.id].y - minY - 30}" width="196" height="60"/>`).join('');
      const svgEdges = visibleEdges.map(edge => { const from = positions[edge.from]; const to = positions[edge.to]; return from && to ? `<line x1="${from.x - minX}" y1="${from.y - minY}" x2="${to.x - minX}" y2="${to.y - minY}" stroke="#818cf8" stroke-width="2"/>` : ''; }).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX}" height="${maxY - minY}" viewBox="0 0 ${maxX - minX} ${maxY - minY}"><rect width="100%" height="100%" fill="#06070f"/>${svgEdges}${svgNodes}</svg>`;
      downloadBlob(svg, filename, 'image/svg+xml;charset=utf-8');
    } else {
      const activeCanvas = document.querySelector('#network-canvas canvas') || container.querySelector('canvas');
      const snapshotLink = document.createElement('a');
      snapshotLink.href = activeCanvas.toDataURL('image/png', 1.0);
      snapshotLink.download = filename;
      document.body.appendChild(snapshotLink);
      snapshotLink.click();
      document.body.removeChild(snapshotLink);
    }
  } catch (error) {
    notice(`Lineage snapshot export failed: ${error.message}`);
  } finally {
    networkNodes.update([...previous.nodeOpacity].map(([id, opacity]) => ({id, opacity})));
    networkEdges.update([...previous.edgeOpacity].map(([id, opacity]) => ({id, opacity})));
    container.style.width = previous.width;
    container.style.height = previous.height;
    container.style.overflow = previous.overflow;
    network.setSize('100%', '100%');
    network.moveTo({position: previous.view, scale: previous.scale, animation: false});
    closeExportMenu();
  }
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

// ---------- Profile Popover & Security Modal ----------
function toggleProfilePopover() {
  const card = document.getElementById('profilePopoverCard');
  if (!card) return;
  const isHidden = card.hidden;
  const exportDropdown = document.getElementById('exportDropdownMenu');
  if (exportDropdown) exportDropdown.classList.add('hidden');
  if (isHidden) {
    card.hidden = false;
    document.getElementById('userAvatarBtn')?.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => window.addEventListener('click', closePopoverOnOutsideClick), 0);
  } else {
    closePopoverCardMenu();
  }
}

function closePopoverCardMenu() {
  const card = document.getElementById('profilePopoverCard');
  if (card) card.hidden = true;
  document.getElementById('userAvatarBtn')?.setAttribute('aria-expanded', 'false');
  window.removeEventListener('click', closePopoverOnOutsideClick);
}

function closePopoverOnOutsideClick(event) {
  const moduleContainer = document.getElementById('userProfileModule');
  if (moduleContainer && !moduleContainer.contains(event.target)) closePopoverCardMenu();
}

function passwordRequirementState(password, confirmation) {
  return accountPasswordRequirementState(password, confirmation);
}

function updatePasswordRequirements() {
  const password = document.getElementById('newPasswordInput')?.value || '';
  const confirmation = document.getElementById('confirmPasswordInput')?.value || '';
  const requirements = passwordRequirementState(password, confirmation);
  Object.entries(requirements).forEach(([name, met]) => {
    const item = document.querySelector(`[data-password-requirement="${name}"]`);
    if (!item) return;
    item.classList.toggle('met', met);
    item.querySelector('span').textContent = met ? 'âœ“' : 'â—‹';
  });
  return Object.values(requirements).every(Boolean);
}

function openUserProfileModal() {
  closePopoverCardMenu();
  document.getElementById('userProfileModal')?.removeAttribute('hidden');
  updatePasswordRequirements();
}

function closeUserProfileModal() {
  const modal = document.getElementById('userProfileModal');
  if (modal) modal.hidden = true;
  const currentPassword = document.getElementById('currentPasswordInput');
  const newPassword = document.getElementById('newPasswordInput');
  const confirmPassword = document.getElementById('confirmPasswordInput');
  if (currentPassword) currentPassword.value = '';
  if (newPassword) newPassword.value = '';
  if (confirmPassword) confirmPassword.value = '';
  updatePasswordRequirements();
}

async function saveProfileSecurityChanges() {
  const currentPassword = document.getElementById('currentPasswordInput')?.value || '';
  const newPassword = document.getElementById('newPasswordInput')?.value || '';
  const confirmPassword = document.getElementById('confirmPasswordInput')?.value || '';
  if (newPassword || confirmPassword || currentPassword) {
    if (!currentPassword) return notice('Enter your current password.');
    if (!updatePasswordRequirements()) return notice('Meet all password requirements before saving.');
    try {
      await api('/api/profile/password', {method: 'PATCH', body: JSON.stringify({current_password: currentPassword, password: newPassword})});
      notice('Profile security changes saved.');
    } catch (error) {
      return notice(error.message);
    }
  }
  closeUserProfileModal();
}

function handlePopoverAction(action) {
  closePopoverCardMenu();
  if (action === 'signout') document.getElementById('logoutButton')?.click();
  if (action === 'manage-approvals') openReviews();
  if (action === 'manage-users') openUsers();
  if (action === 'help') window.location.href = '/help';
}

function initializeAvatarInitials() {
  if (!state.user) return;
    const fullName = state.user.display_name || state.user.username || '';
  const avatarInitials = accountInitials(state.user.display_name, state.user.username);


  const initialsTargets = ['avatarInitialsDisplay', 'popoverAvatarInitials', 'modalAvatarInitials'];
  initialsTargets.forEach(id => {
    const target = document.getElementById(id);
    if (target) target.textContent = avatarInitials;
  });

  const userNameElement = document.getElementById('popoverUserName');
  if (userNameElement) userNameElement.textContent = fullName || 'User Name';
  const userEmailElement = document.getElementById('popoverUserEmail');
  if (userEmailElement) userEmailElement.textContent = state.user.username || '';

  const savedAvatar = localStorage.getItem('user_profile_avatar');
  if (savedAvatar) {
    applySavedAvatarData(savedAvatar);
  }
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64Data = e.target.result;
      localStorage.setItem('user_profile_avatar', base64Data);
      applySavedAvatarData(base64Data);
    };
    reader.readAsDataURL(file);
  }
}

function applySavedAvatarData(dataString) {
    accountApplyAvatar(dataString);
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
if ($('logoutButton')) {
  $('logoutButton').onclick = async () => {
    try {
      await api('/api/logout', {method: 'POST'});
    } catch (error) {
      console.error('Logout error:', error);
    }
    state.user = null;
    state.csrf = null;
    hide('vaultView');
    show('loginView');
  };
}
  if ($('themeToggle')) {
  $('themeToggle').onclick = toggleTheme;
}

const themeObserver = new MutationObserver(mutations => {
  if (mutations.some(mutation => mutation.type === 'attributes' && mutation.attributeName === 'data-theme')) {
    executeThemeCanvasRefresh();
  }
});
themeObserver.observe(document.documentElement, {attributes: true});
if ($('exportDropdownBtn')) {
  $('exportDropdownBtn').onclick = event => {
    event.stopPropagation();
    const menu = $('exportDropdownMenu');
    const hidden = menu.classList.toggle('hidden');
    $('exportDropdownBtn').setAttribute('aria-expanded', String(!hidden));
  };
}
if ($('svgExportBtn')) $('svgExportBtn').onclick = triggerSvgExport;
if ($('pngExportBtn')) $('pngExportBtn').onclick = triggerPngExport;
if ($('existingGedcomBtn')) $('existingGedcomBtn').onclick = triggerGedcomExport;
if ($('pumlExportBtn')) $('pumlExportBtn').onclick = triggerPumlExport;
document.addEventListener('click', event => {
  const container = $('exportMenuContainer');
  if (container && !container.contains(event.target)) closeExportMenu();
});
const edgeSelect = $('edgeStyleSelect');
if (edgeSelect) {
  edgeSelect.value = state.edgeStyle;
  edgeSelect.onchange = event => {
    state.edgeStyle = event.target.value;
    localStorage.setItem('familyVaultEdgeStyle', state.edgeStyle);
    renderTree();
  };
}
if ($('searchInput')) $('searchInput').oninput = renderTree;
if ($('yearSlider')) $('yearSlider').oninput = renderTree;
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
if ($('organicView')) $('organicView').onclick = () => setViewMode('organic');
if ($('classicView')) $('classicView').onclick = () => setViewMode('classic');
setViewMode(state.viewMode);
if ($('resetView')) {
  $('resetView').onclick = () => {
    if (network) network.fit({animation: true});
  };
}
if ($('addButton')) $('addButton').onclick = () => openPanel();
if ($('newPasswordInput')) $('newPasswordInput').oninput = updatePasswordRequirements;
if ($('confirmPasswordInput')) $('confirmPasswordInput').oninput = updatePasswordRequirements;
document.querySelectorAll('[data-close]').forEach(button => (button.onclick = () => hide(button.dataset.close)));
const backdrop = $('overlayBackdrop');
if (backdrop) {
  backdrop.onclick = () => OVERLAY_IDS.forEach(hide);
}
boot();








