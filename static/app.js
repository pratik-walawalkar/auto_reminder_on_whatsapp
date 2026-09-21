const state = {user: null, csrf: null, family: null, scale: 1, x: 40, y: 40, drag: null, activePersonId: null};
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

function year(person) {
  return person.birth_year ?? null;
}

function show(id) {
  $(id).hidden = false;
  if (id === 'sidePanel') $('sidePanelBackdrop').hidden = false;
}

function hide(id) {
  $(id).hidden = true;
  if (id === 'sidePanel') $('sidePanelBackdrop').hidden = true;
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
  $('exportGedcomButton').hidden = !isAdmin;
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
function familyLinks(visible) {
  const links = [];
  for (const union of state.family.unions || []) {
    const partners = union.partners.map(item => item.individual_id).filter(id => visible.has(id));
    for (const child of union.children || []) {
      if (!visible.has(child.individual_id)) continue;
      for (const parentId of partners) links.push([parentId, child.individual_id]);
    }
  }
  return links;
}

function renderTree() {
  if (!state.family) return;
  const query = $('searchInput').value.trim().toLowerCase();
  const targetYear = Number($('yearSlider').value);
  $('yearLabel').textContent = targetYear;
  const people = state.family.individuals.filter(
    person => (!year(person) || year(person) <= targetYear) && (!query || displayName(person).toLowerCase().includes(query))
  );
  const visible = new Set(people.map(person => person.id));
  const groups = {};
  for (const person of people) {
    const key = person.generation || 'Unassigned';
    (groups[key] ??= []).push(person);
  }
  const order = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
  const positions = new Map();
  order.forEach((group, row) =>
    groups[group]
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      .forEach((person, column) => positions.set(person.id, {x: 160 + column * 260, y: 140 + row * 200}))
  );
  const links = familyLinks(visible);
  const canvas = $('treeCanvas');
  canvas.className = 'tree-canvas';
  canvas.style.transform = `translate(${state.x}px,${state.y}px) scale(${state.scale})`;
  canvas.innerHTML = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'edge-layer');
  svg.setAttribute('viewBox', '0 0 1800 1200');
  for (const [parent, child] of links) {
    const a = positions.get(parent);
    const b = positions.get(child);
    if (!a || !b) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('d', `M${a.x},${a.y + 48} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y - 48}`);
    svg.append(path);
  }
  canvas.append(svg);

  for (const person of people) {
    const point = positions.get(person.id);
    const node = document.createElement('button');
    node.className = `person-node ${(person.gender || 'U').toLowerCase()}`;
    if (state.activePersonId === person.id) node.classList.add('active');
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    const tags = (person.tags || []).slice(0, 4).map(tag => `<span class="node-tag">${escapeHtml(tag)}</span>`).join('');
    node.innerHTML = `
      <div class="node-top">
        <span class="node-avatar">${escapeHtml(initials(person))}</span>
        <div>
          <span class="node-name">${escapeHtml(displayName(person))}</span>
          <span class="node-year">Born ${escapeHtml(person.vital_events?.birth?.date || 'unknown')}</span>
        </div>
        ${person.is_private ? '<span class="node-lock" title="Private record">🔒</span>' : ''}
      </div>
      ${tags ? `<div class="node-tags">${tags}</div>` : ''}
    `;
    node.addEventListener('click', () => openPanel(person));
    canvas.append(node);
  }
  notice(people.length ? `${people.length} family member${people.length === 1 ? '' : 's'} shown.` : 'No family members match this view.');
}

// ---------- Side panel: view / add / edit ----------
function field(label, name, value = '', type = 'text', wide = false, placeholder = '') {
  return `<label class="${wide ? 'wide' : ''}">${label}<input name="${name}" value="${escapeHtml(value)}" type="${type}" placeholder="${escapeHtml(placeholder)}"></label>`;
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
  const unionChoices = (state.family.unions || [])
    .map(union => {
      const names = union.partners
        .map(partner => displayName(state.family.individuals.find(item => item.id === partner.individual_id) || {first_name: partner.individual_id}))
        .join(' & ');
      return `<option value="${escapeHtml(union.id)}">${escapeHtml(names)}</option>`;
    })
    .join('');
  const relationshipFields = person
    ? ''
    : `<label class="wide">Relationship<select name="relationship" id="relationship">
         <option value="new_root">No known parents / start a branch</option>
         <option value="child_of_union">Child of an existing family unit</option>
       </select></label>
       <label class="wide" id="unionField" hidden>Parents' family unit<select name="union_id"><option value="">Choose parents</option>${unionChoices}</select></label>`;
  const deleteButton = person ? '<button type="button" class="danger" id="deleteButton">Delete this person</button>' : '';

  $('sidePanelContent').innerHTML = `
    <p class="eyebrow">${person ? 'EDIT PROPOSAL' : 'NEW PERSON PROPOSAL'}</p>
    <h2>${person ? escapeHtml(displayName(person)) : 'Add a family member'}</h2>
    <p>Changes are reviewed by a family administrator before they update the tree.</p>
    ${contextBlock}
    <form id="personForm" class="form-grid">
      ${field('First name *', 'first_name', person?.first_name || '')}
      ${field('Middle name', 'middle_name', person?.middle_name || '')}
      ${field('Last name *', 'last_name', person?.last_name || '')}
      <label>Gender *
        <select name="gender">
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
      <div class="wide panel-actions">
        <button type="submit">Submit for review</button>
        <button type="button" class="secondary" id="cancelForm">Cancel</button>
      </div>
      <p id="formError" class="error wide" hidden></p>
    </form>
    ${deleteButton}
  `;
  const relationship = $('relationship');
  if (relationship) relationship.onchange = () => { $('unionField').hidden = relationship.value !== 'child_of_union'; };
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
    notice(person ? 'Your edit was submitted for administrator review.' : `Your addition was submitted for review as "${result.person_id}".`);
  } catch (error) {
    const target = $('formError');
    target.textContent = error.message;
    target.hidden = false;
  }
}

async function submitDeleteProposal(person) {
  if (!confirm(`Submit a proposal to delete ${displayName(person)}? An administrator must approve it.`)) return;
  try {
    await api('/api/proposals', {method: 'POST', body: JSON.stringify({kind: 'delete', target_id: person.id})});
    hide('sidePanel');
    notice('Your deletion request was submitted for administrator review.');
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

// ---------- Pan / zoom ----------
function setPanZoom() {
  const viewport = $('treeViewport');
  const canvas = $('treeCanvas');
  viewport.addEventListener('pointerdown', event => {
    if (event.target.closest('.person-node')) return;
    state.drag = {x: event.clientX, y: event.clientY, baseX: state.x, baseY: state.y, moved: false};
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!state.drag) return;
    const dx = event.clientX - state.drag.x;
    const dy = event.clientY - state.drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.drag.moved = true;
    state.x = state.drag.baseX + dx;
    state.y = state.drag.baseY + dy;
    canvas.style.transform = `translate(${state.x}px,${state.y}px) scale(${state.scale})`;
  });
  viewport.addEventListener('pointerup', () => (state.drag = null));
  viewport.addEventListener(
    'wheel',
    event => {
      event.preventDefault();
      state.scale = Math.max(0.35, Math.min(2.5, state.scale * (event.deltaY < 0 ? 1.1 : 0.9)));
      canvas.style.transform = `translate(${state.x}px,${state.y}px) scale(${state.scale})`;
    },
    {passive: false}
  );
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
$('searchInput').oninput = renderTree;
$('yearSlider').oninput = renderTree;
$('resetView').onclick = () => {
  state.scale = 1;
  state.x = 40;
  state.y = 40;
  renderTree();
};
$('addButton').onclick = () => openPanel();
$('reviewButton').onclick = openReviews;
$('usersButton').onclick = openUsers;
document.querySelectorAll('[data-close]').forEach(button => (button.onclick = () => hide(button.dataset.close)));
setPanZoom();
boot();
