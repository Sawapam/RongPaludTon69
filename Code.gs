/**
 * ระบบจัดอันดับผู้สอบแข่งขัน
 * ไฟล์: Code.gs
 *
 * ชีตข้อมูล: การตอบแบบฟอร์ม 1
 * A ประทับเวลา
 * B ชื่อ
 * C เบอร์โทรศัพท์
 * D สนามสอบ
 * E คะแนนที่ได้
 * F อายุราชการ
 * G ความดีความชอบ(ขั้น)
 * H วุฒิการศึกษา
 * I โทษทางวินัย
 */

const APP_CONFIG = Object.freeze({
  SHEET_NAME: 'การตอบแบบฟอร์ม 1',
  HEADER_ROW: 1,
  DATA_START_ROW: 2,
  SCORE_DECIMALS: 4
});

function doGet(e) {
  try {
    const action = normalizeText_(e && e.parameter && e.parameter.action);

    if (action && action !== 'ranking') {
      return jsonOutput_({
        success: false,
        message: 'ไม่รองรับ action: ' + action
      });
    }

    return jsonOutput_(getRankingData());
  } catch (error) {
    return jsonOutput_({
      success: false,
      message: error && error.message
        ? error.message
        : 'เกิดข้อผิดพลาดจากระบบ'
    });
  }
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * อ่านข้อมูลจากชีต คำนวณคะแนน และจัดอันดับ
 */
function getRankingData() {
  try {
    const sheet = getDataSheet_();
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    if (lastRow < APP_CONFIG.DATA_START_ROW || lastColumn < 9) {
      return buildEmptyResponse_();
    }

    const values = sheet
      .getRange(APP_CONFIG.HEADER_ROW, 1, lastRow, lastColumn)
      .getDisplayValues();

    const headers = values[0].map(normalizeText_);
    const col = resolveHeaderIndexes_(headers);

    const candidates = values
      .slice(1)
      .map((row, index) => parseCandidateRow_(row, index + APP_CONFIG.DATA_START_ROW, col))
      .filter(item => item.name !== '');

    if (!candidates.length) {
      return buildEmptyResponse_();
    }

    const maxServiceMonths = Math.max(
      0,
      ...candidates.map(item => item.serviceTotalMonths)
    );

    const maxMeritStep = Math.max(
      0,
      ...candidates.map(item => item.meritStep)
    );

    const rows = candidates.map(item => {
      const serviceScore = maxServiceMonths > 0
        ? (item.serviceTotalMonths * 15) / maxServiceMonths
        : 0;

      const meritScore = maxMeritStep > 0
        ? (item.meritStep * 5) / maxMeritStep
        : 0;

      const educationScore = getEducationScore_(item.education);
      const disciplineScore = getDisciplineScore_(item.discipline);

      const totalScore =
        item.examScore +
        serviceScore +
        meritScore +
        educationScore +
        disciplineScore;

      return {
        ...item,
        serviceScore: roundScore_(serviceScore),
        meritScore: roundScore_(meritScore),
        educationScore: educationScore,
        disciplineScore: disciplineScore,
        totalScore: roundScore_(totalScore)
      };
    });

    rows.sort(compareRankingRows_);
    assignCompetitionRanks_(rows);

    const examSites = [...new Set(
      rows.map(item => item.examSite).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'th'));

    return {
      success: true,
      generatedAt: formatDateTime_(new Date()),
      summary: {
        totalCandidates: rows.length,
        highestExamScore: roundScore_(Math.max(...rows.map(item => item.examScore))),
        highestTotalScore: roundScore_(Math.max(...rows.map(item => item.totalScore))),
        maxServiceMonths: maxServiceMonths,
        maxServiceText: monthsToThaiText_(maxServiceMonths),
        maxMeritStep: roundScore_(maxMeritStep),
        examSites: examSites
      },
      rows: rows
    };

  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error && error.message
        ? error.message
        : 'เกิดข้อผิดพลาดในการอ่านข้อมูล'
    };
  }
}

function getDataSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('ไม่พบ Google Spreadsheet ที่ผูกกับ Apps Script');
  }

  const sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('ไม่พบชีตชื่อ "' + APP_CONFIG.SHEET_NAME + '"');
  }

  return sheet;
}

function resolveHeaderIndexes_(headers) {
  const aliases = {
    timestamp: ['ประทับเวลา'],
    name: ['ชื่อ', 'ชื่อ-สกุล', 'ชื่อสกุล'],
    phone: ['เบอร์โทรศัพท์', 'โทรศัพท์', 'เบอร์โทร'],
    examSite: ['สนามสอบ'],
    examScore: ['คะแนนที่ได้', 'คะแนนสอบ'],
    serviceTenure: ['อายุราชการ'],
    meritStep: ['ความดีความชอบ(ขั้น)', 'ความดีความชอบ', 'ขั้นความดีความชอบ'],
    education: ['วุฒิการศึกษา', 'วุฒิ'],
    discipline: ['โทษทางวินัย', 'วินัย']
  };

  const result = {};
  Object.keys(aliases).forEach(key => {
    const index = findHeaderIndex_(headers, aliases[key]);
    if (index === -1) {
      throw new Error('ไม่พบหัวตาราง: ' + aliases[key][0]);
    }
    result[key] = index;
  });

  return result;
}

function findHeaderIndex_(headers, candidates) {
  const normalizedCandidates = candidates.map(normalizeHeader_);
  return headers.findIndex(header =>
    normalizedCandidates.includes(normalizeHeader_(header))
  );
}

function normalizeHeader_(value) {
  return normalizeText_(value)
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '');
}

function parseCandidateRow_(row, sourceRow, col) {
  const tenure = parseServiceTenure_(row[col.serviceTenure]);

  return {
    sourceRow: sourceRow,
    timestamp: normalizeText_(row[col.timestamp]),
    name: normalizeText_(row[col.name]),
    phone: normalizeText_(row[col.phone]),
    phoneMasked: maskPhone_(row[col.phone]),
    examSite: normalizeText_(row[col.examSite]),
    examScore: parseNumber_(row[col.examScore]),
    serviceTenureRaw: normalizeText_(row[col.serviceTenure]),
    serviceYears: tenure.originalYears,
    serviceMonths: tenure.originalMonths,
    serviceDays: tenure.originalDays,
    serviceRoundedText: tenure.displayText,
    serviceTotalMonths: tenure.totalMonths,
    meritStep: parseNumber_(row[col.meritStep]),
    education: normalizeText_(row[col.education]),
    discipline: normalizeText_(row[col.discipline])
  };
}

/**
 * รองรับ:
 * 20
 * 20 ปี
 * 19 ปี 10 เดือน 26 วัน
 *
 * กติกา:
 * วันตั้งแต่ 15 วันขึ้นไป ปัดเพิ่ม 1 เดือน
 */
function parseServiceTenure_(value) {
  const text = normalizeText_(value);

  if (!text) {
    return {
      originalYears: 0,
      originalMonths: 0,
      originalDays: 0,
      totalMonths: 0,
      displayText: '0 ปี 0 เดือน'
    };
  }

  if (/^-?\d+(\.\d+)?$/.test(text.replace(/,/g, ''))) {
    const numericYears = Math.max(0, parseNumber_(text));
    const totalMonths = Math.round(numericYears * 12);

    return {
      originalYears: Math.floor(numericYears),
      originalMonths: Math.round((numericYears % 1) * 12),
      originalDays: 0,
      totalMonths: totalMonths,
      displayText: monthsToThaiText_(totalMonths)
    };
  }

  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*ปี/);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*เดือน/);
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*วัน/);

  const years = yearMatch ? parseFloat(yearMatch[1]) : 0;
  const months = monthMatch ? parseFloat(monthMatch[1]) : 0;
  const days = dayMatch ? parseFloat(dayMatch[1]) : 0;

  let totalMonths = Math.floor(years * 12) + Math.floor(months);

  if (days >= 15) {
    totalMonths += 1;
  }

  totalMonths = Math.max(0, totalMonths);

  return {
    originalYears: years,
    originalMonths: months,
    originalDays: days,
    totalMonths: totalMonths,
    displayText: monthsToThaiText_(totalMonths)
  };
}

function getEducationScore_(value) {
  const text = normalizeText_(value).toLowerCase().replace(/\s+/g, '');

  if (!text) return 2;

  if (
    text.includes('ป.เอก') ||
    text.includes('ปริญญาเอก') ||
    text.includes('เอก')
  ) return 5;

  if (
    text.includes('ป.โท') ||
    text.includes('ปริญญาโท') ||
    text.includes('โท')
  ) return 4;

  if (
    text.includes('ป.ตรี') ||
    text.includes('ปริญญาตรี') ||
    text.includes('ตรี')
  ) return 3;

  return 2;
}

function getDisciplineScore_(value) {
  const text = normalizeText_(value).toLowerCase().replace(/\s+/g, '');

  if (!text || text.includes('ไม่มี')) return 5;
  if (text.includes('ไล่ออก')) return 0;
  if (text.includes('ปลดออก')) return 1;
  if (text.includes('ลดขั้นเงินเดือน')) return 2;
  if (text.includes('ตัดเงินเดือน')) return 3;
  if (text.includes('ภาคทัณฑ์')) return 4;

  return 5;
}

function compareRankingRows_(a, b) {
  if (!nearlyEqual_(a.totalScore, b.totalScore)) {
    return b.totalScore - a.totalScore;
  }

  if (!nearlyEqual_(a.examScore, b.examScore)) {
    return b.examScore - a.examScore;
  }

  if (a.serviceTotalMonths !== b.serviceTotalMonths) {
    return b.serviceTotalMonths - a.serviceTotalMonths;
  }

  if (!nearlyEqual_(a.meritStep, b.meritStep)) {
    return b.meritStep - a.meritStep;
  }

  return a.name.localeCompare(b.name, 'th');
}

/**
 * อันดับร่วมแบบ Competition Ranking:
 * 1, 2, 2, 4
 *
 * ถือว่าอันดับร่วมเมื่อคะแนนรวม คะแนนสอบ อายุราชการ
 * และความดีความชอบเท่ากัน
 */
function assignCompetitionRanks_(rows) {
  let previous = null;
  let currentRank = 0;

  rows.forEach((row, index) => {
    const isTied = previous &&
      nearlyEqual_(row.totalScore, previous.totalScore) &&
      nearlyEqual_(row.examScore, previous.examScore) &&
      row.serviceTotalMonths === previous.serviceTotalMonths &&
      nearlyEqual_(row.meritStep, previous.meritStep);

    if (!isTied) {
      currentRank = index + 1;
    }

    row.rank = currentRank;
    row.isTied = Boolean(isTied);
    previous = row;
  });
}

function parseNumber_(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = normalizeText_(value)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');

  const number = parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function maskPhone_(value) {
  const text = normalizeText_(value);
  const digits = text.replace(/\D/g, '');

  if (digits.length < 7) return text;

  return digits.slice(0, 3) + '-xxx-' + digits.slice(-4);
}

function monthsToThaiText_(totalMonths) {
  const months = Math.max(0, Math.round(totalMonths || 0));
  const yearsPart = Math.floor(months / 12);
  const monthsPart = months % 12;
  return yearsPart + ' ปี ' + monthsPart + ' เดือน';
}

function roundScore_(value) {
  const power = Math.pow(10, APP_CONFIG.SCORE_DECIMALS);
  return Math.round((Number(value) + Number.EPSILON) * power) / power;
}

function nearlyEqual_(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.00005;
}

function normalizeText_(value) {
  return String(value == null ? '' : value).trim();
}

function formatDateTime_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone() || 'Asia/Bangkok',
    'dd/MM/yyyy HH:mm:ss'
  );
}

function buildEmptyResponse_() {
  return {
    success: true,
    generatedAt: formatDateTime_(new Date()),
    summary: {
      totalCandidates: 0,
      highestExamScore: 0,
      highestTotalScore: 0,
      maxServiceMonths: 0,
      maxServiceText: '0 ปี 0 เดือน',
      maxMeritStep: 0,
      examSites: []
    },
    rows: []
  };
}
