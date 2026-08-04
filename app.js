const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw7Dzk1CzR0sGwecF52RCffqchc9yHQDurqVudZPbU-baSNJu8vHXV2aNzW6_Z7i08rKA/exec';

let allRows = [];
let officialRows = [];
let adminSummary = {};
let qualityData = null;
let qualitySection = 'duplicates';
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
  $('exportExcelBtn').addEventListener('click', exportRankingExcel);
  $('printReportBtn').addEventListener('click', printRankingReport);
  $('closeModalBtn').addEventListener('click', closeDetail);
  $('detailModal').addEventListener('click', e => { if (e.target.id === 'detailModal') closeDetail(); });
  document.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.querySelectorAll('[data-quality-section]').forEach(btn =>
    btn.addEventListener('click', () => selectQualitySection(btn.dataset.qualitySection))
  );
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
  document.querySelectorAll('.admin-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === view)
  );
  $('statusFilter').disabled = view === 'official' || view === 'quality';
  $('reportActions').classList.toggle('hidden', view !== 'ranking');
  $('dataQualityPanel').classList.toggle('hidden', view !== 'quality');
  $('siteProgressPanel').classList.toggle('hidden', view === 'quality');
  $('searchInput').disabled = view === 'quality';
  $('siteFilter').disabled = view === 'quality';
  await loadCurrentView();
}

async function loadCurrentView() {
  if (currentView === 'official') return loadOfficial();
  if (currentView === 'quality') return loadDataQuality();
  return loadWorkspace();
}

async function loadWorkspace() {
  setLoading(true, 'กำลังอ่านข้อมูลผู้สมัคร');
  try {
    const data = await apiGet('adminWorkspace');
    if (!data.success) throw new Error(data.message || 'ไม่สามารถอ่านข้อมูลได้');

    allRows = Array.isArray(data.rows) ? data.rows : [];
    adminSummary = data.summary || {};
    updateSummary(adminSummary);
    populateSiteFilter(adminSummary.examSites || []);
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


async function loadDataQuality() {
  setLoading(true, 'กำลังตรวจสอบคุณภาพข้อมูล');

  try {
    const data = await apiGet('dataQuality');

    if (!data.success) {
      throw new Error(data.message || 'ไม่สามารถตรวจสอบคุณภาพข้อมูลได้');
    }

    qualityData = data;
    $('generatedAt').textContent =
      'ตรวจสอบคุณภาพข้อมูลล่าสุด ' + (data.generatedAt || '-');

    renderDataQuality();
  } catch (error) {
    $('tableContainer').innerHTML =
      '<div class="error-state">' +
      escapeHtml(error.message || 'เกิดข้อผิดพลาดจากระบบ') +
      '</div>';
  } finally {
    setLoading(false);
  }
}

function selectQualitySection(section) {
  if (!['duplicates', 'unmatched', 'similar', 'anomalies'].includes(section)) {
    return;
  }

  qualitySection = section;

  document.querySelectorAll('.quality-section-tab').forEach(btn => {
    btn.classList.toggle(
      'active',
      btn.dataset.qualitySection === qualitySection
    );
  });

  if (currentView === 'quality' && qualityData) {
    renderDataQualityTable();
  }
}

function renderDataQuality() {
  const summary = qualityData && qualityData.summary
    ? qualityData.summary
    : {};

  const healthScore = Number(summary.healthScore || 0);
  const ready = Boolean(summary.readyForReport);

  setText(
    'qualityStatusText',
    ready
      ? 'ฐานข้อมูลพร้อมออกรายงานอย่างเป็นทางการ'
      : 'พบข้อมูลที่ต้องตรวจสอบก่อนออกรายงาน'
  );

  setText('healthScoreBadge', formatNumber(healthScore, 2) + '%');
  $('healthScoreBadge').classList.toggle('ready', ready);
  $('healthScoreBadge').classList.toggle('warning', !ready);
  $('healthScoreBar').style.width =
    Math.max(0, Math.min(100, healthScore)) + '%';

  setText(
    'duplicateGroupCount',
    formatNumber(summary.duplicateGroupCount || 0, 0)
  );
  setText(
    'unmatchedQualityCount',
    formatNumber(summary.unmatchedCount || 0, 0)
  );
  setText(
    'similarNameCount',
    formatNumber(summary.similarNameCount || 0, 0)
  );
  setText(
    'anomalyCount',
    formatNumber(summary.anomalyCount || 0, 0)
  );

  renderDataQualityTable();
}

function renderDataQualityTable() {
  if (!qualityData) {
    return emptyTable();
  }

  if (qualitySection === 'duplicates') {
    return renderDuplicateGroups();
  }

  if (qualitySection === 'unmatched') {
    return renderUnmatchedRows();
  }

  if (qualitySection === 'similar') {
    return renderSimilarNames();
  }

  return renderAnomalyRows();
}

function renderDuplicateGroups() {
  const groups = Array.isArray(qualityData.duplicateGroups)
    ? qualityData.duplicateGroups
    : [];

  setCount(groups.length, groups.length);

  if (!groups.length) {
    $('tableContainer').innerHTML =
      '<div class="quality-success-state">✓ ไม่พบข้อมูลซ้ำ</div>';
    return;
  }

  $('tableContainer').innerHTML = groups.map((group, groupIndex) => `
    <section class="duplicate-group">
      <div class="duplicate-group-header">
        <div>
          <strong>${escapeHtml(group.label)}</strong>
          <span>${escapeHtml(group.key)} • ${formatNumber(group.count, 0)} รายการ</span>
        </div>
        <span class="quality-warning-chip">ต้องเลือกเก็บ 1 รายการ</span>
      </div>

      <div class="duplicate-options">
        ${group.rows.map((row, rowIndex) => `
          <label class="duplicate-option">
            <input
              type="radio"
              name="duplicateKeep${groupIndex}"
              value="${escapeAttr(row.sourceRow)}"
              ${rowIndex === 0 ? 'checked' : ''}
            >
            <span class="duplicate-option-body">
              <strong>${escapeHtml(row.name || '-')}</strong>
              <small>
                แถว ${formatNumber(row.sourceRow, 0)}
                • ${escapeHtml(row.fullExamId || '-')}
                • ${escapeHtml(row.phoneMasked || row.phone || '-')}
                • ${escapeHtml(row.examSite || '-')}
                • ${escapeHtml(statusText(row.status))}
              </small>
            </span>
          </label>
        `).join('')}
      </div>

      <div class="duplicate-actions">
        <button
          class="delete-duplicate-btn"
          type="button"
          onclick="deleteDuplicateGroup(${groupIndex})"
        >
          เก็บรายการที่เลือก และลบรายการซ้ำ
        </button>
      </div>
    </section>
  `).join('');
}

async function deleteDuplicateGroup(groupIndex) {
  const groups = qualityData && Array.isArray(qualityData.duplicateGroups)
    ? qualityData.duplicateGroups
    : [];

  const group = groups[groupIndex];
  if (!group) return;

  const selected = document.querySelector(
    `input[name="duplicateKeep${groupIndex}"]:checked`
  );

  if (!selected) {
    alert('กรุณาเลือกรายการที่ต้องการเก็บ');
    return;
  }

  const keepSourceRow = Number(selected.value);
  const deleteSourceRows = group.rows
    .map(row => Number(row.sourceRow))
    .filter(rowNumber => rowNumber !== keepSourceRow);

  const keepRow = group.rows.find(
    row => Number(row.sourceRow) === keepSourceRow
  );

  const confirmed = window.confirm(
    'ยืนยันเก็บรายการนี้\\n\\n' +
    (keepRow ? keepRow.name : '') +
    ' • แถว ' + keepSourceRow +
    '\\n\\nและลบรายการซ้ำอีก ' +
    deleteSourceRows.length +
    ' รายการหรือไม่?\\n\\nรายการที่ลบจะถูกสำรองไว้ในชีต DataQualityArchive'
  );

  if (!confirmed) return;

  setLoading(true, 'กำลังสำรองและลบข้อมูลซ้ำ');

  try {
    const data = await apiPost({
      action: 'adminDeleteDuplicates',
      key: adminAccessCode,
      duplicateType: group.type,
      duplicateKey: group.key,
      keepSourceRow,
      deleteSourceRows
    });

    if (!data.success) {
      throw new Error(data.message || 'ลบข้อมูลซ้ำไม่สำเร็จ');
    }

    await loadWorkspace();
    await loadDataQuality();
  } catch (error) {
    alert(error.message || 'เกิดข้อผิดพลาดจากระบบ');
  } finally {
    setLoading(false);
  }
}

function renderUnmatchedRows() {
  const rows = Array.isArray(qualityData.unmatchedRows)
    ? qualityData.unmatchedRows
    : [];

  setCount(rows.length, rows.length);

  if (!rows.length) {
    $('tableContainer').innerHTML =
      '<div class="quality-success-state">✓ ทุกข้อมูลจับคู่กับรายชื่อทางการแล้ว</div>';
    return;
  }

  const body = rows.map(row => `
    <tr>
      <td>${formatNumber(row.sourceRow, 0)}</td>
      <td class="text-left">${escapeHtml(row.name || '-')}</td>
      <td>${escapeHtml(row.fullExamId || '-')}</td>
      <td>${escapeHtml(row.last3 || '-')}</td>
      <td>${escapeHtml(row.phoneMasked || row.phone || '-')}</td>
      <td class="text-left">${escapeHtml(row.examSite || '-')}</td>
      <td>${escapeHtml(statusText(row.status))}</td>
    </tr>
  `).join('');

  $('tableContainer').innerHTML = tableHtml(
    ['แถว', 'ชื่อ-สกุล', 'เลขประจำตัวสอบ', '3 หลักท้าย', 'เบอร์โทร', 'สนามสอบ', 'สถานะ'],
    body
  );
}

function renderSimilarNames() {
  const pairs = Array.isArray(qualityData.similarNames)
    ? qualityData.similarNames
    : [];

  setCount(pairs.length, pairs.length);

  if (!pairs.length) {
    $('tableContainer').innerHTML =
      '<div class="quality-success-state">✓ ไม่พบชื่อที่คล้ายกันผิดปกติ</div>';
    return;
  }

  const body = pairs.map(pair => `
    <tr>
      <td>${formatNumber(pair.similarity, 2)}%</td>
      <td class="text-left">
        <strong>${escapeHtml(pair.left.name)}</strong>
        <div class="muted">แถว ${formatNumber(pair.left.sourceRow, 0)} • ${escapeHtml(pair.left.fullExamId || '-')}</div>
      </td>
      <td class="text-left">
        <strong>${escapeHtml(pair.right.name)}</strong>
        <div class="muted">แถว ${formatNumber(pair.right.sourceRow, 0)} • ${escapeHtml(pair.right.fullExamId || '-')}</div>
      </td>
      <td>${escapeHtml(pair.left.examSite || '-')}</td>
      <td>${escapeHtml(pair.right.examSite || '-')}</td>
    </tr>
  `).join('');

  $('tableContainer').innerHTML = tableHtml(
    ['ความคล้าย', 'รายการที่ 1', 'รายการที่ 2', 'สนามสอบ 1', 'สนามสอบ 2'],
    body
  );
}

function renderAnomalyRows() {
  const rows = Array.isArray(qualityData.anomalyRows)
    ? qualityData.anomalyRows
    : [];

  setCount(rows.length, rows.length);

  if (!rows.length) {
    $('tableContainer').innerHTML =
      '<div class="quality-success-state">✓ ไม่พบข้อมูลผิดปกติ</div>';
    return;
  }

  const body = rows.map(row => `
    <tr>
      <td>${formatNumber(row.sourceRow, 0)}</td>
      <td class="text-left">${escapeHtml(row.name || '-')}</td>
      <td>${escapeHtml(row.fullExamId || '-')}</td>
      <td>${escapeHtml(row.phoneMasked || row.phone || '-')}</td>
      <td class="text-left">
        ${(row.problems || []).map(problem =>
          `<span class="problem-chip">${escapeHtml(problem)}</span>`
        ).join('')}
      </td>
    </tr>
  `).join('');

  $('tableContainer').innerHTML = tableHtml(
    ['แถว', 'ชื่อ-สกุล', 'เลขประจำตัวสอบ', 'เบอร์โทร', 'ปัญหาที่พบ'],
    body
  );
}

function statusText(status) {
  const map = {
    APPROVED: 'อนุมัติแล้ว',
    PENDING: 'รอตรวจสอบ',
    REJECTED: 'ไม่อนุมัติ'
  };

  return map[status] || status || '-';
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
        ? ' • ยังจับคู่กับรายชื่อทางการไม่ได้ ' + formatNumber(needsReview, 0) + ' รายการ'
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

  setText('highestExamScore', formatNumber(summary.highestExamScore || 0, 0));
  setText('highestTotalScore', formatNumber(summary.highestTotalScore || 0, 2));
  setText('maxServiceText', summary.maxServiceText || '0 ปี 0 เดือน');
  setText('maxMeritStep', formatNumber(summary.maxMeritStep || 0, 2));
  setText('highestEducation', summary.highestEducation || '-');
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
  if (currentView === 'quality') return renderDataQuality();
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
  updateSiteProgress(rows.length);
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
  updateSiteProgress(rows.length);
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
  updateSiteProgress(rows.length);
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
  const filtered = Number(count) || 0;
  const sourceTotal = Number(total) || 0;

  $('resultCount').textContent =
    filtered === sourceTotal
      ? `กำลังแสดง ${formatNumber(filtered, 0)} รายการ`
      : `กำลังแสดง ${formatNumber(filtered, 0)} รายการ จากข้อมูลในมุมมองนี้ ${formatNumber(sourceTotal, 0)} รายการ`;
}

function updateSiteProgress(visibleCount) {
  const selectedSite = $('siteFilter').value;
  const bySite = adminSummary.bySite || {};

  const official = selectedSite
    ? Number((bySite[selectedSite] || {}).official || 0)
    : Number(adminSummary.officialTotal || 0);

  const submitted = selectedSite
    ? Number((bySite[selectedSite] || {}).submitted || 0)
    : Number(adminSummary.officialSubmitted || 0);

  const notSubmitted = Math.max(0, official - submitted);
  const percent = official ? Math.min(100, (submitted / official) * 100) : 0;

  $('siteProgressTitle').textContent = selectedSite
    ? '📍 สนามสอบ' + selectedSite
    : '👥 ทุกสนามสอบ';

  $('siteProgressSubtitle').textContent =
    formatNumber(submitted, 0) +
    ' จาก ' +
    formatNumber(official, 0) +
    ' คน ส่งข้อมูลแล้ว';

  $('siteProgressPercent').textContent = formatNumber(percent, 2) + '%';
  $('siteProgressBar').style.width = Math.max(0, percent) + '%';

  setText('siteOfficialCount', formatNumber(official, 0));
  setText('siteSubmittedCount', formatNumber(submitted, 0));
  setText('siteNotSubmittedCount', formatNumber(notSubmitted, 0));
  setText('siteVisibleCount', formatNumber(visibleCount || 0, 0));
}

function getRankingRowsForReport() {
  const keyword = $('searchInput').value.trim().toLowerCase();
  const site = $('siteFilter').value;

  return allRows
    .filter(row => row.status === 'APPROVED')
    .filter(row => {
      const searchable = [
        row.name,
        row.fullExamId,
        row.examSite
      ].join(' ').toLowerCase();

      return (!keyword || searchable.includes(keyword)) &&
        (!site || row.examSite === site);
    })
    .sort((a, b) =>
      Number(a.rank || 999999) - Number(b.rank || 999999)
    );
}

function exportRankingExcel() {
  const rows = getRankingRowsForReport();

  if (!rows.length) {
    alert('ไม่พบข้อมูลที่อนุมัติแล้วสำหรับส่งออก');
    return;
  }

  const siteText = $('siteFilter').value || 'ทุกสนามสอบ';
  const generatedAt = new Date().toLocaleString('th-TH');

  const headers = [
    'อันดับ',
    'เลขประจำตัวสอบ',
    'ชื่อ-สกุล',
    'สนามสอบ',
    'คะแนนสอบ',
    'อายุราชการ',
    'คะแนนอายุราชการ',
    'ความดีความชอบ (ขั้น)',
    'คะแนนความดีความชอบ',
    'วุฒิการศึกษา',
    'คะแนนวุฒิ',
    'โทษทางวินัย',
    'คะแนนวินัย',
    'คะแนนรวม'
  ];

  const tableRows = rows.map(row => [
    row.rank,
    row.fullExamId || '',
    row.name || '',
    row.examSite || '',
    formatNumber(row.examScore, 0),
    row.serviceRoundedText || '',
    formatNumber(row.serviceScore, 2),
    formatNumber(row.meritStep, 2),
    formatNumber(row.meritScore, 2),
    row.education || '',
    formatNumber(row.educationScore, 0),
    row.discipline || '',
    formatNumber(row.disciplineScore, 0),
    formatNumber(row.totalScore, 2)
  ]);

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <style>
        body{font-family:Tahoma,Arial,sans-serif}
        h2,p{text-align:center}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #444;padding:6px;font-size:12px}
        th{background:#d9e7f5;font-weight:bold;text-align:center}
        td:nth-child(3),td:nth-child(4),td:nth-child(6),
        td:nth-child(10),td:nth-child(12){text-align:left}
        td{text-align:center}
      </style>
    </head>
    <body>
      <h2>บัญชีจัดอันดับผู้เข้าสอบตำแหน่งรองปลัด ระดับต้น 69</h2>
      <p>${escapeHtml(siteText)} • ${escapeHtml(generatedAt)} • จำนวน ${rows.length} คน</p>
      <table>
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${tableRows.map(row =>
            `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', html], {
    type: 'application/vnd.ms-excel;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeSite = siteText.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9_-]+/g, '_');

  link.href = url;
  link.download =
    'ranking_รองปลัดระดับต้น69_' +
    safeSite +
    '_' +
    new Date().toISOString().slice(0, 10) +
    '.xls';

  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printRankingReport() {
  const rows = getRankingRowsForReport();

  if (!rows.length) {
    alert('ไม่พบข้อมูลที่อนุมัติแล้วสำหรับพิมพ์รายงาน');
    return;
  }

  const siteText = $('siteFilter').value || 'ทุกสนามสอบ';
  const generatedAt = new Date().toLocaleString('th-TH');
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('เบราว์เซอร์ปิดกั้นหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up');
    return;
  }

  const bodyRows = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.rank)}</td>
      <td>${escapeHtml(row.fullExamId || '-')}</td>
      <td class="left">${escapeHtml(row.name || '-')}</td>
      <td class="left">${escapeHtml(row.examSite || '-')}</td>
      <td>${formatNumber(row.examScore, 0)}</td>
      <td class="left">${escapeHtml(row.serviceRoundedText || '-')}</td>
      <td>${formatNumber(row.serviceScore, 2)}</td>
      <td>${formatNumber(row.meritStep, 2)}</td>
      <td>${formatNumber(row.meritScore, 2)}</td>
      <td class="left">${escapeHtml(row.education || '-')}</td>
      <td>${formatNumber(row.educationScore, 0)}</td>
      <td class="left">${escapeHtml(row.discipline || '-')}</td>
      <td>${formatNumber(row.disciplineScore, 0)}</td>
      <td class="total">${formatNumber(row.totalScore, 2)}</td>
    </tr>
  `).join('');

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>บัญชีจัดอันดับผู้เข้าสอบ</title>
      <style>
        @page{size:A4 landscape;margin:9mm}
        *{box-sizing:border-box}
        body{
          margin:0;
          color:#000;
          font-family:"Prompt","TH Sarabun New",Tahoma,sans-serif;
          font-size:10px;
        }
        .report-header{text-align:center;margin-bottom:8px}
        .report-header h1{margin:0;font-size:18px}
        .report-header h2{margin:4px 0 0;font-size:14px;font-weight:600}
        .report-meta{
          display:flex;
          justify-content:space-between;
          gap:12px;
          margin:8px 0;
          font-size:10px;
        }
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        th,td{
          border:1px solid #000;
          padding:3px 2px;
          text-align:center;
          vertical-align:middle;
          overflow-wrap:anywhere;
        }
        th{background:#e9eef5;font-weight:700}
        .left{text-align:left}
        .total{font-weight:700}
        .page-footer{
          position:fixed;
          bottom:0;
          left:0;
          right:0;
          text-align:right;
          font-size:9px;
        }
        .page-number:after{content:counter(page)}
        thead{display:table-header-group}
        tr{page-break-inside:avoid}
      </style>
    </head>
    <body>
      <div class="report-header">
        <h1>บัญชีจัดอันดับผู้เข้าสอบ</h1>
        <h2>ตำแหน่งรองปลัดเทศบาล ระดับต้น 69</h2>
      </div>
      <div class="report-meta">
        <span>สนามสอบ: ${escapeHtml(siteText)}</span>
        <span>จำนวนผู้ได้รับอนุมัติ: ${rows.length} คน</span>
        <span>พิมพ์เมื่อ: ${escapeHtml(generatedAt)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:3%">อันดับ</th>
            <th style="width:7%">เลขสอบ</th>
            <th style="width:11%">ชื่อ-สกุล</th>
            <th style="width:8%">สนามสอบ</th>
            <th style="width:5%">คะแนนสอบ</th>
            <th style="width:8%">อายุราชการ</th>
            <th style="width:6%">คะแนนอายุฯ</th>
            <th style="width:5%">ความดีฯ (ขั้น)</th>
            <th style="width:6%">คะแนนความดีฯ</th>
            <th style="width:8%">วุฒิ</th>
            <th style="width:5%">คะแนนวุฒิ</th>
            <th style="width:8%">วินัย</th>
            <th style="width:5%">คะแนนวินัย</th>
            <th style="width:6%">คะแนนรวม</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="page-footer">หน้า <span class="page-number"></span></div>
      <script>
        window.onload = function(){
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
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
function logout() {
  adminAccessCode = '';
  allRows = [];
  officialRows = [];
  qualityData = null;
  sessionStorage.removeItem('rankingAdminKey');
  showLoginView();
}
function showAdminView() { $('loginView').classList.add('hidden'); $('adminView').classList.remove('hidden'); }
function showLoginView() { $('adminView').classList.add('hidden'); $('loginView').classList.remove('hidden'); setTimeout(() => $('accessCode').focus(),0); }
function showLoginError(message) { $('loginError').textContent=message; $('loginError').classList.remove('hidden'); }
function hideLoginError() { $('loginError').textContent=''; $('loginError').classList.add('hidden'); }
function setLoading(show,title='กำลังโหลดข้อมูล') { $('loadingOverlay').classList.toggle('hidden',!show); $('loadingTitle').textContent=title; $('loginBtn').disabled=show; $('refreshBtn').disabled=show; }
function setText(id,value) { $(id).textContent=value; }
function formatNumber(value, decimals) { const n=Number(value); return Number.isFinite(n) ? n.toLocaleString('th-TH',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}) : '0'; }
function escapeHtml(value) { return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function escapeAttr(value) { return escapeHtml(value); }
