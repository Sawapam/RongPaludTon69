const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw7Dzk1CzR0sGwecF52RCffqchc9yHQDurqVudZPbU-baSNJu8vHXV2aNzW6_Z7i08rKA/exec';

let currentRows = [];

document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('searchForm')
    .addEventListener('submit', handleSearch);

  document
    .getElementById('clearBtn')
    .addEventListener('click', resetSearch);

  document
    .getElementById('closeModalBtn')
    .addEventListener('click', closeDetail);

  document
    .getElementById('detailModal')
    .addEventListener('click', event => {
      if (event.target.id === 'detailModal') {
        closeDetail();
      }
    });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeDetail();
    }
  });
});

async function handleSearch(event) {
  event.preventDefault();

  const keyword = document
    .getElementById('searchInput')
    .value
    .trim();

  hideMessage();
  hideResults();

  if (!keyword) {
    showMessage(
      'กรุณากรอกชื่อ-สกุล หรือเบอร์โทรศัพท์',
      'error'
    );
    return;
  }

  setLoading(true);

  try {
    const separator = GAS_API_URL.includes('?') ? '&' : '?';

    const url =
      GAS_API_URL +
      separator +
      'action=search&q=' +
      encodeURIComponent(keyword) +
      '&_=' +
      Date.now();

    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(
        'เรียกข้อมูลไม่สำเร็จ HTTP ' + response.status
      );
    }

    const data = await response.json();

    if (!data || !data.success) {
      throw new Error(
        data && data.message
          ? data.message
          : 'ไม่สามารถค้นหาข้อมูลได้'
      );
    }

    currentRows = Array.isArray(data.rows)
      ? data.rows
      : [];

    renderResults(data);

  } catch (error) {
    showMessage(
      error && error.message
        ? error.message
        : 'เกิดข้อผิดพลาดจากระบบ',
      'error'
    );
  } finally {
    setLoading(false);
  }
}

function renderResults(data) {
  if (!currentRows.length) {
    showMessage(
      'ไม่พบข้อมูลที่ตรงกับชื่อหรือเบอร์โทรศัพท์นี้',
      'info'
    );
    return;
  }

  const resultSection =
    document.getElementById('resultSection');

  const resultList =
    document.getElementById('resultList');

  const resultMeta =
    document.getElementById('resultMeta');

  resultMeta.textContent =
    'พบ ' +
    formatNumber(data.matchCount || currentRows.length, 0) +
    ' รายการ • ผู้เข้าสอบทั้งหมด ' +
    formatNumber(data.totalCandidates || 0, 0) +
    ' คน • อัปเดต ' +
    (data.generatedAt || '-');

  resultList.innerHTML = currentRows
    .map((row, index) => `
      <button
        class="result-card"
        type="button"
        onclick="openDetail(${index})"
      >
        <div class="result-card-top">
          <div>
            <h3 class="result-name">
              ${escapeHtml(row.name || '-')}
            </h3>

            <div class="result-sub">
              ${escapeHtml(row.examSite || 'ไม่ระบุสนามสอบ')}
              •
              ${escapeHtml(row.phoneMasked || '-')}
            </div>
          </div>

          <div class="rank-badge">
            อันดับที่ ${formatNumber(row.rank, 0)}
          </div>
        </div>

        <div class="result-score">
          <span>คะแนนรวม</span>
          <strong>
            ${formatNumber(row.totalScore, 2)}
          </strong>
        </div>
      </button>
    `)
    .join('');

  resultSection.classList.remove('hidden');

  resultSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function openDetail(index) {
  const row = currentRows[index];

  if (!row) return;

  document.getElementById('modalName').textContent =
    'อันดับที่ ' +
    formatNumber(row.rank, 0) +
    ' — ' +
    (row.name || '-');

  document.getElementById('modalMeta').textContent =
    (row.examSite || 'ไม่ระบุสนามสอบ') +
    ' • ' +
    (row.phoneMasked || '-');

  document.getElementById('modalBody').innerHTML = `
    <div class="detail-grid">
      ${detailItem(
        'คะแนนสอบ',
        formatNumber(row.examScore, 0)
      )}

      ${detailItem(
        'อายุราชการที่บันทึก',
        escapeHtml(row.serviceTenureRaw || '-')
      )}

      ${detailItem(
        'อายุราชการหลังปัดเศษ',
        escapeHtml(row.serviceRoundedText || '-')
      )}

      ${detailItem(
        'คะแนนอายุราชการ',
        formatNumber(row.serviceScore, 2) + ' / 15'
      )}

      ${detailItem(
        'ความดีความชอบ',
        formatNumber(row.meritStep, 2) + ' ขั้น'
      )}

      ${detailItem(
        'คะแนนความดีความชอบ',
        formatNumber(row.meritScore, 2) + ' / 5'
      )}

      ${detailItem(
        'วุฒิการศึกษา',
        escapeHtml(row.education || '-')
      )}

      ${detailItem(
        'คะแนนวุฒิการศึกษา',
        formatNumber(row.educationScore, 0) + ' / 5'
      )}

      ${detailItem(
        'โทษทางวินัย',
        escapeHtml(row.discipline || '-')
      )}

      ${detailItem(
        'คะแนนวินัย',
        formatNumber(row.disciplineScore, 0) + ' / 5'
      )}
    </div>

    <div class="total-panel">
      <span>คะแนนรวม</span>
      <strong>
        ${formatNumber(row.totalScore, 2)}
      </strong>
    </div>

    <div class="formula-note">
      คะแนนรวม = คะแนนสอบ + คะแนนอายุราชการ
      + คะแนนความดีความชอบ + คะแนนวุฒิการศึกษา
      + คะแนนโทษทางวินัย
    </div>
  `;

  document
    .getElementById('detailModal')
    .classList
    .remove('hidden');

  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  document
    .getElementById('detailModal')
    .classList
    .add('hidden');

  document.body.style.overflow = '';
}

function resetSearch() {
  currentRows = [];

  document.getElementById('searchInput').value = '';

  hideMessage();
  hideResults();

  document.getElementById('searchInput').focus();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function hideResults() {
  document
    .getElementById('resultSection')
    .classList
    .add('hidden');

  document.getElementById('resultList').innerHTML = '';
}

function showMessage(message, type) {
  const box = document.getElementById('messageBox');

  box.className =
    'message-box ' +
    (type === 'error' ? 'error' : 'info');

  box.textContent = message;
}

function hideMessage() {
  const box = document.getElementById('messageBox');

  box.className = 'message-box hidden';
  box.textContent = '';
}

function setLoading(isLoading) {
  document
    .getElementById('loadingOverlay')
    .classList
    .toggle('hidden', !isLoading);

  document.getElementById('searchBtn').disabled = isLoading;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <div class="detail-label">
        ${escapeHtml(label)}
      </div>

      <div class="detail-value">
        ${value}
      </div>
    </div>
  `;
}

function formatNumber(value, decimals) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return decimals > 0
      ? Number(0).toFixed(decimals)
      : '0';
  }

  return number.toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
