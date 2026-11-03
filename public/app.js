const $ = (sel) => document.querySelector(sel);

const state = {
  categories: [],
  year: new Date().getFullYear(),
  filter: {},
};

// ---------- 공통 ----------
const won = (n) => Number(n).toLocaleString('ko-KR') + '원';

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
const thisMonth = () => today().slice(0, 7);

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  if (res.status === 401 && path !== '/api/login') {
    showLogin();
    throw new Error('로그인이 필요합니다.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 화면 전환 ----------
function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#password').focus();
}

async function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  if (!state.categories.length) {
    state.categories = await api('/api/categories');
    const opts = state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    $('#f-category').innerHTML = opts;
    $('#s-category').insertAdjacentHTML('beforeend', opts);
  }
  resetForm();
  $('#cat-month').value = thisMonth();
  await refreshAll();
}

// ---------- 로그인 ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
    $('#password').value = '';
    await showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ---------- 지출 폼 (추가/수정) ----------
function resetForm() {
  $('#expense-id').value = '';
  $('#f-date').value = today();
  $('#f-item').value = '';
  $('#f-amount').value = '';
  $('#f-category').selectedIndex = 0;
  $('#form-title').textContent = '지출 추가';
  $('#submit-btn').textContent = '추가';
  $('#cancel-edit').hidden = true;
  $('#form-error').textContent = '';
}

function startEdit(exp) {
  $('#expense-id').value = exp.id;
  $('#f-date').value = exp.spent_on;
  $('#f-item').value = exp.item;
  $('#f-category').value = exp.category;
  $('#f-amount').value = exp.amount;
  $('#form-title').textContent = '지출 수정';
  $('#submit-btn').textContent = '저장';
  $('#cancel-edit').hidden = false;
  $('#f-item').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#cancel-edit').addEventListener('click', resetForm);

$('#expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#form-error').textContent = '';
  const id = $('#expense-id').value;
  const body = JSON.stringify({
    spent_on: $('#f-date').value,
    item: $('#f-item').value,
    category: $('#f-category').value,
    amount: Number($('#f-amount').value),
  });
  try {
    if (id) await api(`/api/expenses/${id}`, { method: 'PUT', body });
    else await api('/api/expenses', { method: 'POST', body });
    resetForm();
    await refreshAll();
  } catch (err) {
    $('#form-error').textContent = err.message;
  }
});

// ---------- 목록 / 검색 ----------
let currentList = [];

async function loadExpenses() {
  const qs = new URLSearchParams(state.filter).toString();
  currentList = await api('/api/expenses' + (qs ? '?' + qs : ''));
  const tbody = $('#expense-list');
  tbody.innerHTML = currentList.map((e) => `
    <tr>
      <td>${e.spent_on}</td>
      <td>${escapeHtml(e.item)}</td>
      <td><span class="tag">${escapeHtml(e.category)}</span></td>
      <td class="num">${won(e.amount)}</td>
      <td class="actions">
        <button class="btn ghost small" data-edit="${e.id}">수정</button>
        <button class="btn ghost small danger" data-del="${e.id}">삭제</button>
      </td>
    </tr>`).join('');
  $('#empty').hidden = currentList.length > 0;
  $('#stat-filtered').textContent = won(currentList.reduce((s, e) => s + e.amount, 0));
  $('#stat-count').textContent = currentList.length + '건';
}

$('#expense-list').addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editId) {
    const exp = currentList.find((x) => String(x.id) === editId);
    if (exp) startEdit(exp);
  }
  if (delId && confirm('이 내역을 삭제할까요?')) {
    try {
      await api(`/api/expenses/${delId}`, { method: 'DELETE' });
      if ($('#expense-id').value === delId) resetForm();
      await refreshAll();
    } catch (err) {
      alert(err.message);
    }
  }
});

function syncSearchInputs() {
  const mode = $('#s-mode').value;
  $('#s-date').hidden = mode !== 'date';
  $('#s-from').hidden = mode !== 'range';
  $('#s-to').hidden = mode !== 'range';
  $('#s-month').hidden = mode !== 'month';
}
$('#s-mode').addEventListener('change', syncSearchInputs);

$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mode = $('#s-mode').value;
  const f = {};
  if (mode === 'date' && $('#s-date').value) f.date = $('#s-date').value;
  if (mode === 'range') {
    if ($('#s-from').value) f.from = $('#s-from').value;
    if ($('#s-to').value) f.to = $('#s-to').value;
  }
  if (mode === 'month' && $('#s-month').value) f.month = $('#s-month').value;
  if ($('#s-category').value) f.category = $('#s-category').value;
  state.filter = f;
  await loadExpenses().catch((err) => alert(err.message));
});

$('#s-reset').addEventListener('click', async () => {
  $('#search-form').reset();
  syncSearchInputs();
  state.filter = {};
  await loadExpenses().catch((err) => alert(err.message));
});

// ---------- 월별 합계 ----------
async function loadMonthly() {
  const data = await api(`/api/summary/monthly?year=${state.year}`);
  $('#year-label').textContent = `${data.year}년`;
  $('#year-total').textContent = won(data.total);
  const max = Math.max(...data.months.map((m) => m.total), 1);
  $('#monthly-chart').innerHTML = data.months.map((m) => `
    <div class="col" title="${m.month}월: ${won(m.total)} (${m.count}건)">
      <span class="col-value">${m.total ? Math.round(m.total / 1000).toLocaleString() + 'k' : ''}</span>
      <div class="col-bar ${m.total ? '' : 'zero'}" style="height:${(m.total / max) * 100}%"></div>
      <span class="col-label">${m.month}월</span>
    </div>`).join('');

  if (data.year === new Date().getFullYear()) {
    const cur = data.months[new Date().getMonth()];
    $('#stat-this-month').textContent = won(cur.total);
  }
}

$('#year-prev').addEventListener('click', () => { state.year -= 1; loadMonthly(); });
$('#year-next').addEventListener('click', () => { state.year += 1; loadMonthly(); });

// ---------- 카테고리별 합계 ----------
async function loadCategory() {
  const month = $('#cat-month').value;
  const data = await api('/api/summary/category' + (month ? `?month=${month}` : ''));
  $('#cat-total').textContent = won(data.total);
  const chart = $('#category-chart');
  if (!data.categories.length) {
    chart.innerHTML = '<p class="muted center">해당 기간의 지출이 없습니다.</p>';
    return;
  }
  const max = Math.max(...data.categories.map((c) => c.total), 1);
  chart.innerHTML = data.categories.map((c) => {
    const pct = data.total ? Math.round((c.total / data.total) * 100) : 0;
    return `
      <div class="bar-row" title="${escapeHtml(c.category)}: ${won(c.total)} (${c.count}건, ${pct}%)">
        <span class="bar-label">${escapeHtml(c.category)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(c.total / max) * 100}%"></div></div>
        <span class="bar-value">${won(c.total)}</span>
      </div>`;
  }).join('');
}

$('#cat-month').addEventListener('change', () => loadCategory().catch((err) => alert(err.message)));

// ---------- 초기화 ----------
async function refreshAll() {
  // 이번 달 합계는 항상 올해 기준으로 계산
  const viewYear = state.year;
  if (viewYear !== new Date().getFullYear()) {
    const cur = await api(`/api/summary/monthly?year=${new Date().getFullYear()}`);
    $('#stat-this-month').textContent = won(cur.months[new Date().getMonth()].total);
  }
  await Promise.all([loadExpenses(), loadMonthly(), loadCategory()]);
}

(async function init() {
  syncSearchInputs();
  try {
    const { authenticated } = await api('/api/session');
    if (authenticated) await showApp();
    else showLogin();
  } catch {
    showLogin();
  }
})();
