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
