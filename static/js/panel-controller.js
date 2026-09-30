function panelRelationshipState(person) {
  const parents = new Set();
  const spouses = new Set();
  for (const union of state.family.unions || []) {
    const partnerIds = (union.partners || []).map(partner => partner.individual_id);
    if (partnerIds.includes(person.id)) partnerIds.filter(id => id !== person.id).forEach(id => spouses.add(id));
    if ((union.children || []).some(child => child.individual_id === person.id)) partnerIds.forEach(id => parents.add(id));
  }
  return {parents: [...parents], spouses: [...spouses]};
}

function panelOpenPanel(person = null) {
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
    ? `${person.is_private ? '<p class="privacy-note">Ã°Å¸â€â€™ Marked private Ã¢â‚¬â€ sensitive details are hidden from non-admin members.</p>' : ''}
       ${existingTags ? `<div class="tag-badges">${existingTags}</div>` : ''}
       <div class="detail-grid">
         <div class="detail-card"><strong>Born</strong>${escapeHtml(birth.date || 'Unknown')}<br>${escapeHtml(birth.location || '')}</div>
         <div class="detail-card"><strong>Died</strong>${escapeHtml(death.date || 'Ã¢â‚¬â€')}<br>${escapeHtml(death.location || '')}</div>
         <div class="detail-card"><strong>Roots</strong>${escapeHtml(culture.native_village || 'Not recorded')}<br>${escapeHtml(culture.gotra_clan || '')}</div>
       </div>
       ${migrationItems ? `<h3>Migration</h3><ul>${migrationItems}</ul>` : ''}`
    : '';
  const gender = person?.gender || 'U';
  const relations = person ? panelRelationshipState(person) : {parents: [], spouses: []};
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
    <p class="wide relationship-summary">Parents: ${escapeHtml(parentIds.map(id => state.family.individuals.find(candidate => candidate.id === id)?.first_name || id).join('-') || 'None')} Ã‚Â· Spouses: ${escapeHtml(spouseIds.map(id => state.family.individuals.find(candidate => candidate.id === id)?.first_name || id).join(', ') || 'None')}</p>`;
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
  $('personForm').onsubmit = event => panelSubmitProposal(event, person);
  if (person) $('deleteButton').onclick = () => panelSubmitDeleteProposal(person);
  renderTree();
  show('sidePanel');
}

async function panelSubmitProposal(event, person) {
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

async function panelSubmitDeleteProposal(person) {
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

