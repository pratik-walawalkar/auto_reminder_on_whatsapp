function panelField(label, name, value = '', type = 'text', wide = false, placeholder = '') {
  return `<label class="${wide ? 'wide' : ''}">${label}<input name="${name}" value="${escapeHtml(value)}" type="${type}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

function panelRelationshipLabels(gender) {
  if (gender === 'M') return {child_of: 'Son of', parent_of: 'Father of', spouse_of: 'Husband of'};
  if (gender === 'F') return {child_of: 'Daughter of', parent_of: 'Mother of', spouse_of: 'Wife of'};
  return {child_of: 'Child of', parent_of: 'Parent of', spouse_of: 'Spouse of'};
}

function panelRelationshipOptionsHtml(gender, isEdit) {
  const labels = panelRelationshipLabels(gender);
  const keepOption = isEdit ? '<option value="keep">No change</option>' : '';
  return `${keepOption}
    <option value="new_root">No known parents / start a branch</option>
    <option value="child_of">${labels.child_of} … (select the parents below)</option>
    <option value="parent_of">${labels.parent_of} … (select a child below)</option>
    <option value="spouse_of">${labels.spouse_of} … (select a spouse below)</option>`;
}
