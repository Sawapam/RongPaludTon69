const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw7Dzk1CzR0sGwecF52RCffqchc9yHQDurqVudZPbU-baSNJu8vHXV2aNzW6_Z7i08rKA/exec';

let allRows = [];

    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('searchInput').addEventListener('input', renderFilteredRows);
      document.getElementById('siteFilter').addEventListener('change', renderFilteredRows);

      document.getElementById('detailModal').addEventListener('click', event => {
        if (event.target.id === 'detailModal') closeDetail();
      });

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeDetail();
      });

      loadData();
    });

    async function loadData() {
      setLoading(true);

      try {
        if (!GAS_API_URL || GAS_API_URL.includes('วาง_URL_WEB_APP_GAS_ตรงนี้')) {
          throw new Error('กรุณากำหนด GAS_API_URL ในไฟล์ app.js');
        }

        const separator = GAS_API_URL.includes('?') ? '&' : '?';
        const response = await fetch(
          GAS_API_URL + separator + 'action=ranking&_=' + Date.now(),
          { method: 'GET', cache: 'no-store', redirect: 'follow' }
        );

        if (!response.ok) {
          throw new Error('เรียกข้อมูลไม่สำเร็จ HTTP ' + response.status);
        }

        const data = await response.json();
        handleDataSuccess(data);
      } catch (error) {
        handleDataFailure(error);
      }
    }

    function handleDataSuccess(response) {
      setLoading(false);

      if (!response || !response.success) {
        showError(response && response.message ? response.message : 'ไม่สามารถอ่านข้อมูลได้');
        return;
      }

      allRows = Array.isArray(response.rows) ? response.rows : [];
      updateSummary(response.summary || {});
      populateSiteFilter((response.summary && response.summary.examSites) || []);
      renderFilteredRows();

      document.getElementById('generatedAt').textContent =
        'อัปเดตข้อมูลล่าสุด ' + (response.generatedAt || '-');
    }

    function handleDataFailure(error) {
      setLoading(false);
      showError(error && error.message ? error.message : 'เกิดข้อผิดพลาดจากระบบ');
    }

    function updateSummary(summary) {
      setText('totalCandidates', formatNumber(summary.totalCandidates || 0, 0));
      setText('highestExamScore', formatNumber(summary.highestExamScore || 0, 0));
      setText('highestTotalScore', formatNumber(summary.highestTotalScore || 0, 2));
      setText('maxServiceText', summary.maxServiceText || '0 ปี 0 เดือน');
      setText(
        'maxMeritStep',
        'ความดีความชอบสูงสุด ' + formatNumber(summary.maxMeritStep || 0, 2) + ' ขั้น'
      );
    }

    function populateSiteFilter(sites) {
      const select = document.getElementById('siteFilter');
      const current = select.value;

      select.innerHTML = '<option value="">ทุกสนามสอบ</option>';

      sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site;
        option.textContent = site;
        select.appendChild(option);
      });

      if ([...select.options].some(option => option.value === current)) {
        select.value = current;
      }
    }

    function renderFilteredRows() {
      const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
      const site = document.getElementById('siteFilter').value;

      const rows = allRows.filter(row => {
        const searchable = [row.name, row.phone, row.phoneMasked]
          .map(value => String(value || '').toLowerCase())
          .join(' ');
        const matchesName = !keyword || searchable.includes(keyword);
        const matchesSite = !site || row.examSite === site;
        return matchesName && matchesSite;
      });

      document.getElementById('resultCount').textContent =
        'แสดง ' + formatNumber(rows.length, 0) + ' จาก ' + formatNumber(allRows.length, 0) + ' รายการ';

      renderTable(rows);
    }

    function renderTable(rows) {
      const container = document.getElementById('tableContainer');

      if (!rows.length) {
        container.innerHTML = '<div class="empty-state">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>';
        return;
      }

      const body = rows.map((row, index) => `
        <tr>
          <td class="rank-cell">
            <span class="rank-medal">${rankLabel(row.rank)}</span>
          </td>
          <td class="text-left">
            <button class="name-btn" type="button" onclick="openDetail(${row.sourceRow})">
              ${escapeHtml(row.name)}
            </button>
          </td>
          <td>${escapeHtml(row.phoneMasked || '-')}</td>
          <td class="text-left">${escapeHtml(row.examSite || '-')}</td>
          <td>${formatNumber(row.examScore, 0)}</td>
          <td class="text-left">${escapeHtml(row.serviceRoundedText || '-')}</td>
          <td>${formatNumber(row.serviceScore, 2)}</td>
          <td>${formatNumber(row.meritScore, 2)}</td>
          <td>${formatNumber(row.educationScore, 0)}</td>
          <td>${formatNumber(row.disciplineScore, 0)}</td>
          <td class="score-main">${formatNumber(row.totalScore, 2)}</td>
        </tr>
      `).join('');

      container.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>อันดับ</th>
              <th>ชื่อ-สกุล</th>
              <th>เบอร์โทรศัพท์</th>
              <th>สนามสอบ</th>
              <th>คะแนนสอบ</th>
              <th>อายุราชการ</th>
              <th>คะแนนอายุราชการ</th>
              <th>คะแนนความดีฯ</th>
              <th>วุฒิการศึกษา</th>
              <th>คะแนนวินัย</th>
              <th>คะแนนรวม</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      `;
    }

    function openDetail(sourceRow) {
      const row = allRows.find(item => Number(item.sourceRow) === Number(sourceRow));
      if (!row) return;

      document.getElementById('modalName').textContent =
        'อันดับ ' + row.rank + ' — ' + row.name;

      document.getElementById('modalMeta').textContent =
        (row.examSite || 'ไม่ระบุสนามสอบ') + ' • ' + (row.phoneMasked || '-');

      document.getElementById('modalBody').innerHTML = `
        <div class="detail-grid">
          ${detailItem('คะแนนสอบ', formatNumber(row.examScore, 0))}
          ${detailItem('อายุราชการที่บันทึก', escapeHtml(row.serviceTenureRaw || '-'))}
          ${detailItem('อายุราชการหลังปัดเศษ', escapeHtml(row.serviceRoundedText || '-'))}
          ${detailItem('คะแนนอายุราชการ', formatNumber(row.serviceScore, 2) + ' / 15')}
          ${detailItem('ความดีความชอบ', formatNumber(row.meritStep, 2) + ' ขั้น')}
          ${detailItem('คะแนนความดีความชอบ', formatNumber(row.meritScore, 2) + ' / 5')}
          ${detailItem('วุฒิการศึกษา', escapeHtml(row.education || '-'))}
          ${detailItem('คะแนนวุฒิการศึกษา', formatNumber(row.educationScore, 0) + ' / 5')}
          ${detailItem('โทษทางวินัย', escapeHtml(row.discipline || '-'))}
          ${detailItem('คะแนนวินัย', formatNumber(row.disciplineScore, 0) + ' / 5')}
        </div>

        <div class="total-panel">
          <span>คะแนนรวม</span>
          <strong>${formatNumber(row.totalScore, 2)}</strong>
        </div>

        <div class="formula-note">
          คะแนนรวม = คะแนนสอบ + คะแนนอายุราชการ + คะแนนความดีความชอบ
          + คะแนนวุฒิการศึกษา + คะแนนโทษทางวินัย
        </div>
      `;

      document.getElementById('detailModal').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }

    function closeDetail() {
      document.getElementById('detailModal').classList.add('hidden');
      document.body.style.overflow = '';
    }

    function detailItem(label, value) {
      return `
        <div class="detail-item">
          <div class="detail-label">${label}</div>
          <div class="detail-value">${value}</div>
        </div>
      `;
    }

    function rankLabel(rank) {
      if (rank === 1) return '🥇 1';
      if (rank === 2) return '🥈 2';
      if (rank === 3) return '🥉 3';
      return String(rank);
    }

    function setLoading(isLoading) {
      document.getElementById('loadingOverlay').classList.toggle('hidden', !isLoading);
      document.getElementById('refreshBtn').disabled = isLoading;
    }

    function showError(message) {
      document.getElementById('tableContainer').innerHTML =
        '<div class="error-state"><strong>ไม่สามารถแสดงข้อมูลได้</strong><br>' +
        escapeHtml(message) +
        '</div>';
    }

    function setText(id, value) {
      document.getElementById(id).textContent = value;
    }

    function formatNumber(value, decimals) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '0';

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
