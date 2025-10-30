/* =========================================================================
 * Maple M Viewer — Utilities
 * ========================================================================= */

const $ = (sel) => document.querySelector(sel);
const ICON_PREFIX = "https://open.api.nexon.com/static/maplestorym/asset/icon/";

/* ---------- 칩 유틸 ---------- */
function chip(text, cls = "") {
  const s = document.createElement("span");
  s.className = `chip ${cls}`.trim();
  s.textContent = text;
  return s;
}
function chipRow(...chips) {
  const r = document.createElement("div");
  r.className = "chip-row";
  chips.filter(Boolean).forEach((c) => r.append(c));
  return r;
}
function chipStack(parent, labels = [], cls = "") {
  const wrap = document.createElement("div");
  wrap.className = `chip-stack ${cls}`.trim();
  labels.forEach((l) => wrap.append(chipRow(chip(l))));
  parent.append(wrap);
  return wrap;
}
function chipSection(title, rowsBuilder) {
  const wrap = document.createElement("div");
  wrap.className = "chip-section";
  const tt = document.createElement("div");
  tt.className = "chip-title";
  tt.textContent = title;
  wrap.append(tt);
  const body = document.createElement("div");
  body.className = "chip-stack stacked";
  if (typeof rowsBuilder === "function") rowsBuilder(body);
  wrap.append(body);
  return wrap;
}

/* ---------- 숫자 포맷 ---------- */
function toManNotation(n) {
  if (n == null) return "-";
  const num = Number(String(n).replace(/[^\d]/g, ""));
  if (!Number.isFinite(num)) return String(n);
  const man = Math.floor(num / 10000);
  const rest = num % 10000;
  if (man <= 0) return num.toLocaleString();
  return `${man} 만 ${String(rest).padStart(4, "0")}`;
}

/* ---------- 효과 텍스트 → 칩 ---------- */
function effectTextToChips(text) {
  if (!text) return [];
  let t = String(text).replace(/\s+/g, " ").trim();
  t = t.replace(/[\[\]]/g, ""); // 표시용 대괄호 제거
  const lv = t.match(/Lv\.?\s*([0-9]+)/i);
  const chips = [];
  if (lv) {
    chips.push(`Lv. ${lv[1]}`);
    t = (t.slice(0, lv.index) + t.slice(lv.index + lv[0].length)).trim();
    t = t.replace(/^[·•\/\|\;\s]+/, "");
  }
  const parts = t
    .split(/\n|<br\s*\/?>|[·•\/\|\;]|,\s+(?!\d)/i) // 천단위 콤마는 유지
    .map((s) => s.trim())
    .filter(Boolean);
  parts.forEach((p) => chips.push(p));
  return chips;
}
function setEffectToChips(text) {
  if (!text) return [];
  const t = String(text).trim().replace(/^\[|\]$/g, "").replace(/[\r\n]+/g, " ");
  return t.split(/,\s+(?!\d)/).map((s) => s.trim()).filter(Boolean);
}

/* ---------- 아이콘 URL 보정 ---------- */
function looksLikeHash(s) {
  return typeof s === "string" && /^[0-9a-f]{64,}$/i.test(s);
}
function normalizeIconUrl(u) {
  if (!u) return u;
  if (typeof u !== "string") return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (looksLikeHash(u)) return ICON_PREFIX + u;
  return u;
}
function normalizeAllIconsInPlace(obj, set = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach((v) => normalizeAllIconsInPlace(v, set));
    return set;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const isIconKey = k.endsWith("_icon") || k === "character_image" || k === "android_icon";
      if (isIconKey && typeof v === "string") {
        const fixed = normalizeIconUrl(v);
        obj[k] = fixed;
        if (fixed) set.add(fixed);
      }
      normalizeAllIconsInPlace(v, set);
    }
  }
  return set;
}

/* ---------- 등급 칩/테두리 ---------- */
const GRADE_CHIP_CLASS = {
  일반: "grade-normal",
  노말: "grade-normal",
  레어: "grade-rare",
  에픽: "grade-epic",
  유니크: "grade-unique",
  레전더리: "grade-legendary",
};
const GRADE_BORDER_CLASS = {
  일반: "grade-border-normal",
  노말: "grade-border-normal",
  레어: "grade-border-rare",
  에픽: "grade-border-epic",
  유니크: "grade-border-unique",
  레전더리: "grade-border-legendary",
};

/* ---------- 장신구 판단 ---------- */
const ACCESSORY_SLOTS = new Set([
  "반지 1","반지 2","반지 3","반지 4",
  "목걸이 1","목걸이 2","귀걸이 1",
  "얼굴장식","눈장식","훈장","칭호","뱃지","포켓",
]);
function isAccessorySlot(slotLabel = "") { return ACCESSORY_SLOTS.has(slotLabel); }

/* ---------- 전승/전수 라벨 ---------- */
function normalizeAbilityFlag(s, okLabel, badLabel) {
  if (!s) return null;
  const str = String(s);
  const ok = /가능|able|true|1/i.test(str);
  const no = /불가|not|false|0/i.test(str);
  if (ok && !no) return okLabel;
  if (no && !ok) return badLabel;
  return str;
}

/* ---------- DOM 유틸 ---------- */
function elt(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function safeImg(url, alt = "", size = 56, cls = "") {
  if (!url) return null;
  const img = document.createElement("img");
  img.alt = alt;
  img.width = size;
  img.height = size;
  img.src = normalizeIconUrl(url);
  if (cls) img.className = cls;
  img.onerror = () => img.remove();
  return img;
}
function emptyCard(msg = "없음") {
  const d = document.createElement("div");
  d.className = "empty-card";
  d.textContent = msg;
  return d;
}
function h4(text){ const h=document.createElement("h4"); h.textContent=text; return h; }

/* ---------- 슬롯명 정규화 ---------- */
function normalizeSlot(apiSlotName) {
  if (!apiSlotName) return "";
  const s = String(apiSlotName);
  if (s.startsWith("반지")) {
    if (s.includes("2번째")) return "반지 2";
    if (s.includes("3번째")) return "반지 3";
    if (s.includes("4번째")) return "반지 4";
    return "반지 1";
  }
  if (s.startsWith("목걸이")) return s.includes("2번째") ? "목걸이 2" : "목걸이 1";
  if (s.includes("귀고리")) return "귀걸이 1";
  if (s.includes("석궁")) return "무기";
  return s;
}

/* ---------- 그룹/슬롯 ---------- */
const EQUIP_GROUPS = [
  { title:"무기", slots:["무기","보조무기","엠블렘"] },
  { title:"주 방어구", slots:["모자","상의","하의","한벌옷"] },
  { title:"보조 방어구", slots:["장갑","신발","어깨","벨트","망토"] },
  { title:"주 장신구", slots:["반지 1","반지 2","반지 3","반지 4","귀걸이 1","목걸이 1","목걸이 2","얼굴장식","눈장식"] },
  { title:"보조 장신구", slots:["훈장","칭호","뱃지","포켓"] },
];

/* ---------- 펫 타입 칩 ---------- */
function inferPetType(type = "") {
  const s = String(type);
  if (s === "LunaPetit") return "Luna Petite";
  if (s.startsWith("Luna")) return "Luna";
  if (s.startsWith("Wonder")) return "Wonder";
  return "기타";
}
function petTypeChip(type = "") {
  const category = inferPetType(type);
  const typeToClass = {
    "Luna Petite": "grade-unique",
    "Luna": "grade-epic",
    "Wonder": "grade-rare",
    "기타": "grade-rare",
  };
  const cls = typeToClass[category] || "grade-rare";
  return chip(category, cls);
}

const KNOWN_EFFECT_KEYS = [
  '최종 대미지', '물리 대미지', '마법 대미지', '공격력', '마력',
  '크리티컬 확률', '크리티컬 데미지', '보스 공격력', '보스 방어율 무시',
  'HP', 'MP', '물리 방어력', '마법 방어력', '회피율', '이동 속도',
  '경험치 획득량', '파티 경험치 획득량', '메소 획득량', '아이템 드롭률',
  '피버 충전량', '피버 버프 시간 증가', '맥스피버 확률', '맥스 피버 확률', '피버킬 어드밴티지',
  '버프중 최종 대미지', '버프 시간', '재발동 대기 시간', '스탠스 확률',
  '물리 공격력', '마법 공격력', '최대 HP', '최대 MP', '치명타 확률', '치명타 피해',
  '재발동대기시간', '버프중최종대미지'
].sort((a, b) => b.length - a.length);

const UNIQUE_KNOWN_EFFECT_KEYS = [...new Set(KNOWN_EFFECT_KEYS)].sort((a, b) => b.length - a.length);

function parseEffectString(str) {
  const effects = new Map();
  if (!str) return effects;

  let remainingStr = str.replace(/\n/g, ' ').trim();
  
  // A regular expression to find all occurrences of key-value pairs.
  const regex = /([^,]+?)\s*:\s*(-?[\d.,]+%?초?)/g;
  let match;

  while ((match = regex.exec(remainingStr)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();

    const numMatch = value.match(/(-?[\d.,]+)/);
    const num = numMatch ? parseFloat(numMatch[1].replace(/,/g, '')) : 0;
    const unit = value.replace(/-?[\d.,\s]/g, '');

    if (key) {
      if (numMatch) {
        effects.set(key, { num, unit });
      } else {
        effects.set(key, { num: value, unit: '' });
      }
    }
  }

  return effects;
}

function formatEffectString(effects) {
  const lines = [];
  for (const [key, { num, unit }] of effects.entries()) {
    if (typeof num === 'number') {
      lines.push(`${key} : ${num}${unit || ''}`);
    } else {
      lines.push(`${key} : ${num || ''}`);
    }
  }
  return lines.join('\n');
}

export {
  $,
  chip,
  chipRow,
  chipStack,
  chipSection,
  toManNotation,
  effectTextToChips,
  setEffectToChips,
  looksLikeHash,
  normalizeIconUrl,
  normalizeAllIconsInPlace,
  GRADE_CHIP_CLASS,
  GRADE_BORDER_CLASS,
  isAccessorySlot,
  normalizeAbilityFlag,
  elt,
  safeImg,
  emptyCard,
  h4,
  normalizeSlot,
  EQUIP_GROUPS,
  inferPetType,
  petTypeChip,
  parseEffectString,
  formatEffectString
};