const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw7Dzk1CzR0sGwecF52RCffqchc9yHQDurqVudZPbU-baSNJu8vHXV2aNzW6_Z7i08rKA/exec';

let allRows = [];
let officialRows = [];
let currentView = 'workspace';
let adminAccessCode = sessionStorage.getItem('rankingAdminKey') || '';

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  $('loginForm').addEventListener('submit', handleLogin);
  $('refreshBtn').addEventListener('click', loadCurrentView);
  $('logoutBtn').addEventListener('click', logout);
  $('searchInput').addEventListener('input', renderCurrentView);
  $('siteFilter').addEventListener('change', renderCurrentView);
  $('statusFilter').addEventListener('change', renderCurrentView);
  $('closeModalBtn').addEventListener('click', closeDetail);
  $('detailModal').addEventListener('click', e => { if (e.target.id === 'detailModal') closeDetail(); });
  document.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  if (adminAccessCode) {
    showAdminView();
    loadWorkspace();
  }
});

async function handleLogin(event) {
  event.preventDefault();
  const code = $('accessCode').value.trim();
  hideLoginError();
  if (!code) return showLoginError('กรุณากรอกรหัสเข้าถึงผู้ดูแลระบบ');

  adminAccessCode = code;
  showAdminView();
  const ok = await loadWorkspace();

  if (ok) {
    sessionStorage.setItem('rankingAdminKey', adminAccessCode);
    $('accessCode').value = '';
  } else {
    adminAccessCode = '';
    sessionStorage.removeItem('rankingAdminKey');
    showLoginView();
  }
}

async function switchView(view) {
  currentView = view;
  document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  $('statusFilter').disabled = view === 'official';
  await loadCurrentView();
}

async function loadCurrentView() {
  if (currentView === 'official') return loadOfficial();
  return loadWorkspace();
}

async function loadWorkspace() {
  setLoading(true, 'กำลังอ่านข้อมูลผู้สมัคร');
  try {
    const data = await apiGet('adminWorkspace');
    if (!data.success) throw new Error(data.message || 'ไม่สามารถอ่านข้อมูลได้');

    allRows = Array.isArray(data.rows) ? data.rows : [];
    updateSummary(data.summary || {});
    populateSiteFilter(data.summary.examSites || []);
    $('generatedAt').textContent = 'อัปเดตข้อมูลล่าสุด ' + (data.generatedAt || '-');
    renderCurrentView();
    hideLoginError();
    return true;
  } catch (error) {
    showLoginError(error.message || 'เกิดข้อผิดพลาดจากระบบ');
    return false;
  } finally {
    setLoading(false);
  }
}

async function loadOfficial() {
  setLoading(true, 'กำลังอ่านรายชื่อผู้สอบทางการ');
  try {
    const data = await apiGet('officialCandidates');
    if (!data.success) throw new Error(data.message || 'ไม่สามารถอ่านรายชื่อทางการได้');
    officialRows = Array.isArray(data.rows) ? data.rows : [];
    $('generatedAt').textContent = 'อัปเดตข้อมูลล่าสุด ' + (data.generatedAt || '-');
    renderOfficial();
  } catch (error) {
    $('tableContainer').innerHTML = '<div class="error-state">' + escapeHtml(error.message) + '</div>';
  } finally {
    setLoading(false);
  }
}

function updateSummary(summary) {
  const total = Number(summary.total || 0);
  const officialTotal = Number(summary.officialTotal || 0);
  const officialSubmitted = Number(summary.officialSubmitted || 0);
  const needsReview = Number(summary.needsMatchingReview || 0);

  setText('totalCandidates', formatNumber(total, 0));
  setText('approvedCount', formatNumber(summary.approved || 0, 0));
  setText('pendingCount', formatNumber(summary.pending || 0, 0));
  setText('rejectedCount', formatNumber(summary.rejected || 0, 0));
  setText('notSubmittedCount', formatNumber(summary.notSubmitted || 0, 0));

  setText(
    'responseMatchSummary',
    'จับคู่รายชื่อทางการแล้ว ' +
      formatNumber(officialSubmitted, 0) +
      ' คน' +
      (needsReview
        ? ' • ต้องตรวจการจับคู่ ' + formatNumber(needsReview, 0) + ' รายการ'
        : '')
  );

  setText(
    'officialSummary',
    'จากรายชื่อทางการ ' +
      formatNumber(officialTotal, 0) +
      ' คน • ส่งแล้ว ' +
      formatNumber(officialSubmitted, 0) +
      ' คน'
  );
}

function populateSiteFilter(sites) {
  const current = $('siteFilter').value;
  $('siteFilter').innerHTML = '<option value="">ทุกสนามสอบ</option>';
  sites.forEach(site => {
    const option = document.createElement('option');
    option.value = site;
    option.textContent = site;
    $('siteFilter').appendChild(option);
  });
  if ([...$('siteFilter').options].some(o => o.value === current)) $('siteFilter').value = current;
}

function renderCurrentView() {
  if (currentView === 'official') return renderOfficial();
  if (currentView === 'ranking') return renderRanking();
  return renderWorkspace();
}

function getFilteredRows() {
  const keyword = $('searchInput').value.trim().toLowerCase();
  const site = $('siteFilter').value;
  const status = $('statusFilter').value;

  return allRows.filter(row => {
    const searchable = [row.name, row.phone, row.phoneMasked, row.fullExamId, row.last3].join(' ').toLowerCase();
    return (!keyword || searchable.includes(keyword)) &&
      (!site || row.examSite === site) &&
      (!status || row.status === status);
  });
}

function renderWorkspace() {
  const rows = getFilteredRows();
  setCount(rows.length, allRows.length);
  if (!rows.length) return emptyTable();

  const body = rows.map(row => `
    <tr>
      <td class="text-left"><button class="name-btn" onclick="openCandidate('${escapeAttr(row.submissionId)}')">${escapeHtml(row.name)}</button></td>
      <td>${escapeHtml(row.fullExamId || '-')}</td>
      <td>${escapeHtml(row.phoneMasked || '-')}</td>
      <td class="text-left">${escapeHtml(row.examSite || '-')}</td>
      <td>${formatNumber(row.examScore, 0)}</td>
      <td>${statusChip(row.status)}</td>
      <td><button class="action-btn" onclick="openCandidate('${escapeAttr(row.submissionId)}')">จัดการ</button></td>
    </tr>`).join('');

  $('tableContainer').innerHTML = tableHtml(
    ['ชื่อ-สกุล','เลขประจำตัวสอบ','เบอร์โทรศัพท์','สนามสอบ','คะแนนสอบ','สถานะ','จัดการ'],
    body
  );
}

function renderRanking() {
  const rows = getFilteredRows()
    .filter(row => row.status === 'APPROVED')
    .sort((a,b) => Number(a.rank || 999999) - Number(b.rank || 999999));

  setCount(rows.length, allRows.filter(r => r.status === 'APPROVED').length);
  if (!rows.length) return emptyTable();

  const body = rows.map(row => `
    <tr>
      <td class="rank-cell"><span class="rank-medal">${rankLabel(Number(row.rank))}</span></td>
      <td class="text-left"><button class="name-btn" onclick="openCandidate('${escapeAttr(row.submissionId)}')">${escapeHtml(row.name)}</button></td>
      <td class="text-left">${escapeHtml(row.examSite || '-')}</td>
      <td>${formatNumber(row.examScore, 0)}</td>
      <td>${escapeHtml(row.serviceRoundedText || '-')}</td>
      <td>${formatNumber(row.serviceScore, 2)}</td>
      <td>${formatNumber(row.meritScore, 2)}</td>
      <td>${formatNumber(row.educationScore, 0)}</td>
      <td>${formatNumber(row.disciplineScore, 0)}</td>
      <td class="score-main">${formatNumber(row.totalScore, 2)}</td>
    </tr>`).join('');

  $('tableContainer').innerHTML = tableHtml(
    ['อันดับ','ชื่อ-สกุล','สนามสอบ','คะแนนสอบ','อายุราชการ','คะแนนอายุฯ','คะแนนความดีฯ','คะแนนวุฒิ','คะแนนวินัย','คะแนนรวม'],
    body
  );
}

function renderOfficial() {
  const keyword = $('searchInput').value.trim().toLowerCase();
  const site = $('siteFilter').value;
  const rows = officialRows.filter(row => {
    const searchable = [row.name,row.fullExamId,row.last3].join(' ').toLowerCase();
    return (!keyword || searchable.includes(keyword)) && (!site || row.examSite === site);
  });

  setCount(rows.length, officialRows.length);
  if (!rows.length) return emptyTable();

  const body = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.fullExamId)}</td>
      <td>${escapeHtml(row.last3)}</td>
      <td class="text-left">${escapeHtml(row.name)}</td>
      <td class="text-left">${escapeHtml(row.examSite)}</td>
      <td>${row.submitted ? '<span class="status-chip approved">ส่งแล้ว</span>' : '<span class="status-chip pending">ยังไม่ส่ง</span>'}</td>
    </tr>`).join('');

  $('tableContainer').innerHTML = tableHtml(
    ['เลขประจำตัวสอบ','3 หลักท้าย','ชื่อ-สกุล','สนามสอบ','สถานะการส่งข้อมูล'],
    body
  );
}

function openCandidate(submissionId) {
  const row = allRows.find(item => item.submissionId === submissionId);
  if (!row) return;

  $('modalName').textContent = row.name;
  $('modalMeta').textContent = (row.examSite || '-') + ' • ' + (row.fullExamId || '-') + ' • ' + (row.phoneMasked || '-');

  $('modalBody').innerHTML = `
    <div class="detail-grid">
      ${detailItem('สถานะ', statusChip(row.status))}
      ${detailItem('เลขอ้างอิง', escapeHtml(row.submissionId))}
      ${detailItem('คะแนนสอบ', `<input id="editExamScore" type="number" min="0" max="100" value="${escapeAttr(row.examScore)}">`)}
      ${detailItem('เบอร์โทรศัพท์', `<input id="editPhone" type="tel" maxlength="10" value="${escapeAttr(row.phone)}">`)}
      ${detailItem('อายุราชการ (ปี)', `<input id="editServiceYears" type="number" min="0" max="60" value="${escapeAttr(row.serviceYears)}">`)}
      ${detailItem('เดือน', `<input id="editServiceMonths" type="number" min="0" max="11" value="${escapeAttr(row.serviceMonths)}">`)}
      ${detailItem('วัน', `<input id="editServiceDays" type="number" min="0" max="31" value="${escapeAttr(row.serviceDays)}">`)}
      ${detailItem('ความดีความชอบ', `<input id="editMeritStep" type="number" min="0" max="20" step="0.5" value="${escapeAttr(row.meritStep)}">`)}
      ${detailItem('วุฒิการศึกษา', selectEducation(row.education))}
      ${detailItem('โทษทางวินัย', selectDiscipline(row.discipline))}
      ${detailItem('หมายเหตุการตรวจสอบ', `<textarea id="reviewNote" rows="3">${escapeHtml(row.reviewNote || '')}</textarea>`)}
    </div>
    <div class="modal-actions">
      <button class="secondary-action" onclick="saveCandidate('${escapeAttr(row.submissionId)}')">บันทึกการแก้ไข</button>
      <button class="approve-btn" onclick="updateStatus('${escapeAttr(row.submissionId)}','APPROVED')">อนุมัติ</button>
      <button class="pending-btn" onclick="updateStatus('${escapeAttr(row.submissionId)}','PENDING')">รอตรวจสอบ</button>
      <button class="reject-btn" onclick="updateStatus('${escapeAttr(row.submissionId)}','REJECTED')">ไม่อนุมัติ</button>
    </div>`;

  $('detailModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

async function saveCandidate(submissionId) {
  const payload = {
    action: 'adminUpdateCandidate',
    key: adminAccessCode,
    submissionId,
    phone: $('editPhone').value,
    examScore: $('editExamScore').value,
    serviceYears: $('editServiceYears').value,
    serviceMonths: $('editServiceMonths').value,
    serviceDays: $('editServiceDays').value,
    meritStep: $('editMeritStep').value,
    education: $('editEducation').value,
    discipline: $('editDiscipline').value
  };
  await postAndReload(payload, 'กำลังบันทึกการแก้ไข');
}

async function updateStatus(submissionId, status) {
  const payload = {
    action: 'adminUpdateStatus',
    key: adminAccessCode,
    submissionId,
    status,
    note: $('reviewNote') ? $('reviewNote').value : ''
  };
  await postAndReload(payload, 'กำลังอัปเดตสถานะ');
}

async function postAndReload(payload, title) {
  setLoading(true, title);
  try {
    const data = await apiPost(payload);
    if (!data.success) throw new Error(data.message || 'ดำเนินการไม่สำเร็จ');
    closeDetail();
    await loadWorkspace();
  } catch (error) {
    alert(error.message || 'เกิดข้อผิดพลาดจากระบบ');
  } finally {
    setLoading(false);
  }
}

async function apiGet(action) {
  const url = new URL(GAS_API_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('key', adminAccessCode);
  url.searchParams.set('_', Date.now());
  const response = await fetch(url.toString(), { cache: 'no-store', redirect: 'follow' });
  if (!response.ok) throw new Error('เรียกข้อมูลไม่สำเร็จ HTTP ' + response.status);
  return response.json();
}

async function apiPost(payload) {
  const response = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  if (!response.ok) throw new Error('บันทึกข้อมูลไม่สำเร็จ HTTP ' + response.status);
  return response.json();
}

function tableHtml(headers, body) {
  return `<table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function emptyTable() {
  $('tableContainer').innerHTML = '<div class="empty-state">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>';
}

function setCount(count, total) {
  $('resultCount').textContent = `แสดง ${formatNumber(count,0)} จาก ${formatNumber(total,0)} รายการ`;
}

function statusChip(status) {
  const map = {
    APPROVED: ['อนุมัติแล้ว','approved'],
    PENDING: ['รอตรวจสอบ','pending'],
    REJECTED: ['ไม่อนุมัติ','rejected']
  };
  const item = map[status] || [status || '-','pending'];
  return `<span class="status-chip ${item[1]}">${item[0]}</span>`;
}

function selectEducation(value) {
  const options = ['ต่ำกว่าปริญญาตรี','ปริญญาตรี','ปริญญาโท','ปริญญาเอก'];
  return `<select id="editEducation">${options.map(v => `<option ${v===value?'selected':''}>${v}</option>`).join('')}</select>`;
}

function selectDiscipline(value) {
  const options = ['ไม่มี','ภาคทัณฑ์','ตัดเงินเดือน','ลดขั้นเงินเดือน','ปลดออก','ไล่ออก'];
  return `<select id="editDiscipline">${options.map(v => `<option ${v===value?'selected':''}>${v}</option>`).join('')}</select>`;
}

function detailItem(label, value) {
  return `<div class="detail-item"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value">${value}</div></div>`;
}

function rankLabel(rank) {
  if (rank === 1) return '🥇 1';
  if (rank === 2) return '🥈 2';
  if (rank === 3) return '🥉 3';
  return String(rank || '-');
}

function closeDetail() { $('detailModal').classList.add('hidden'); document.body.style.overflow = ''; }
function logout() { adminAccessCode=''; allRows=[]; sessionStorage.removeItem('rankingAdminKey'); showLoginView(); }
function showAdminView() { $('loginView').classList.add('hidden'); $('adminView').classList.remove('hidden'); }
function showLoginView() { $('adminView').classList.add('hidden'); $('loginView').classList.remove('hidden'); setTimeout(() => $('accessCode').focus(),0); }
function showLoginError(message) { $('loginError').textContent=message; $('loginError').classList.remove('hidden'); }
function hideLoginError() { $('loginError').textContent=''; $('loginError').classList.add('hidden'); }
function setLoading(show,title='กำลังโหลดข้อมูล') { $('loadingOverlay').classList.toggle('hidden',!show); $('loadingTitle').textContent=title; $('loginBtn').disabled=show; $('refreshBtn').disabled=show; }
function setText(id,value) { $(id).textContent=value; }
function formatNumber(value, decimals) { const n=Number(value); return Number.isFinite(n) ? n.toLocaleString('th-TH',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}) : '0'; }
function escapeHtml(value) { return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function escapeAttr(value) { return escapeHtml(value); }
