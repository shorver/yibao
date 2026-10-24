// 重建脚本：以当前 universities.js 中“无 type 字段”的条目作为原始本科基底，
// 再从 voc_*.js（高职）与 ext_*.js（本科 benke / 成人高校 chengren）源文件按【真实 type】重建，
// 按校名去重。可反复运行（幂等）。运行：node merge_voc.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const VOC_FILES = ['voc_huabei.js', 'voc_huadong.js', 'voc_huanan.js', 'voc_xinan.js', 'voc_2026new.js'];
const EXT_FILES = ['ext_huabei.js', 'ext_huadong.js', 'ext_huanan.js', 'ext_xinan.js', 'ext_2026new.js'];

function extractArray(code) {
  const m = code.match(/const\s+\w+\s*=\s*(\[[\s\S]*\])\s*;?/);
  if (!m) return null;
  const lit = m[1];
  try { return JSON.parse(lit); }
  catch (e) { try { return eval('(' + lit + ')'); } catch (e2) { return null; } }
}

// 归一化：全角括号→半角、去空白，用于识别“近重名”（同一学校的全/半角不同写法）
function normKey(name) {
  return String(name || '').replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').trim();
}

const uniPath = path.join(dir, 'universities.js');
const uniCode = fs.readFileSync(uniPath, 'utf8');
const existing = new Function(uniCode + '; return UNIVERSITIES;')();

// 原始本科基底 = 无 type 字段的条目（首次手工写入的 426 所主要本科）
// 先按归一化键去重（保留规范全角括号写法，去掉半角重复项）
const normSeen = new Map(); // normKey -> name（保留在库中的规范写法）
const baseBenke = [];
for (const x of existing.filter(x => !x.type)) {
  const k = normKey(x.name);
  if (normSeen.has(k)) { continue; } // 近重名：跳过
  normSeen.set(k, x.name);
  baseBenke.push(x);
}
const dropped = existing.filter(x => !x.type).length - baseBenke.length;
const haveNames = new Set(baseBenke.map(x => x.name));
const final = baseBenke.slice();
const perFile = {};

function addFrom(files, defaultType) {
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { perFile[f] = '缺失'; continue; }
    const arr = extractArray(fs.readFileSync(p, 'utf8'));
    if (!arr) { perFile[f] = '解析失败'; continue; }
    let c = 0, d = 0;
    for (const e of arr) {
      if (!e || !e.name) continue;
      const k = normKey(e.name);
      if (haveNames.has(e.name) || normSeen.has(k)) { d++; continue; }
      normSeen.set(k, e.name);
      final.push({ name: e.name, city: e.city || '', province: e.province || '', type: e.type || defaultType });
      haveNames.add(e.name); c++;
    }
    perFile[f] = '共' + arr.length + ' 新增' + c + ' 去重' + d;
  }
}
addFrom(VOC_FILES, 'vocational');
addFrom(EXT_FILES, 'benke');

// ===== 别名后处理：依据 aliases.js 补齐因旧名在库而漏采的新校，并删除已更名的旧条目 =====
// 规则：new 不在库 → 补入（city/province 优先从旧名条目继承，其次 FALLBACK_CITY 表）；
//       old 在库且与新名同城 → 删除旧条目（旧建制已撤销，旧名经 ALIASES 反查仍可搜到）。
var aliasReport = { added: [], removed: [], kept: [] };
(function applyAliases() {
  const aliasPath = path.join(dir, 'aliases.js');
  if (!fs.existsSync(aliasPath)) { console.log('aliases.js 不存在，跳过后处理'); return; }
  const ALIASES = extractArray(fs.readFileSync(aliasPath, 'utf8')) || [];
  // 旧名条目均不在库时的所在地兜底（校名/教育部公示可确认）
  const FALLBACK_CITY = {
    '山西医药学院': { province: '山西省', city: '汾阳市' },
    '六安应用科技职业学院': { province: '安徽省', city: '六安市' },
    '长春数字科技职业学院': { province: '吉林省', city: '长春市' },
    '深圳城市职业学院': { province: '广东省', city: '深圳市' },
    '湘潭科技职业学院': { province: '湖南省', city: '湘潭市' }
  };
  function inferType(newName, oldEntry) {
    if (/职业技术大学|职业大学/.test(newName)) return 'benke';
    if (/职业学院|职业技术学院|高等专科学校|专科学校/.test(newName)) return 'vocational';
    if (/大学|学院/.test(newName)) return 'benke';
    return oldEntry ? (oldEntry.type || 'benke') : 'benke';
  }
  const nameSet = new Set(final.map(x => x.name));
  for (const a of ALIASES) {
    const olds = Array.isArray(a.old) ? a.old : [a.old];
    // 同名升格（如乌鲁木齐职业大学/黎明职业大学：专科→职业本科，校名不变）：
    // 不删条目，仅将 type 由 vocational 升级为 benke，避免误删后别名反查断链。
    if (olds.indexOf(a.new) >= 0) {
      const self = final.find(x => x.name === a.new);
      if (self && self.type === 'vocational' && /职业大学|大学|学院/.test(a.new)) {
        self.type = 'benke';
        aliasReport.added.push(a.new + '（同名升格，类型 vocational→benke）');
      }
      continue;
    }
    const oldEntries = olds.map(o => final.find(x => x.name === o)).filter(Boolean);
    // 1) 新校不在库 → 补入
    if (!nameSet.has(a.new)) {
      let province = '', city = '', type;
      if (oldEntries.length) {
        province = oldEntries[0].province; city = oldEntries[0].city;
      } else if (FALLBACK_CITY[a.new]) {
        province = FALLBACK_CITY[a.new].province; city = FALLBACK_CITY[a.new].city;
      }
      if (province && city) {
        type = inferType(a.new, oldEntries[0]);
        final.push({ name: a.new, city: city, province: province, type: type });
        nameSet.add(a.new);
        aliasReport.added.push(a.new + '（' + province + '/' + city + '/' + type + '，继承自 ' + (oldEntries.length ? oldEntries[0].name : '兜底表') + '）');
      } else {
        aliasReport.kept.push(a.new + '（无法确定所在地，未补入）');
      }
    }
    // 2) 删除已更名且同城的旧条目
    for (let i = final.length - 1; i >= 0; i--) {
      const x = final[i];
      if (olds.indexOf(x.name) >= 0 && nameSet.has(a.new)) {
        const nu = final.find(y => y.name === a.new);
        if (nu && nu.province === x.province && nu.city === x.city) {
          final.splice(i, 1); nameSet.delete(x.name);
          aliasReport.removed.push(x.name + ' → ' + a.new);
        } else {
          aliasReport.kept.push(x.name + '（与 ' + a.new + ' 不同城，保留待核）');
        }
      }
    }
  }
})();

// ===== 校区后处理：补收名校异地校区、修正校区城市错填 =====
// 背景：名校在异地设的校区/分校有独立招生代码（学生单独参保查询），需独立条目；
//       医学部/医学院不单独招生（无独立学校代码），不建条目，已在 _gen_alias.js 的
//       EXTRA_ALIASES 中以别名方式支持检索。
const BRANCH_CAMPUS = [
  { name: '哈尔滨工业大学（威海）', province: '山东省', city: '威海市', type: 'benke' },
  { name: '哈尔滨工业大学（深圳）', province: '广东省', city: '深圳市', type: 'benke' },
  { name: '山东大学（威海）', province: '山东省', city: '威海市', type: 'benke' },
  { name: '中国农业大学（烟台）', province: '山东省', city: '烟台市', type: 'benke' },
  { name: '中国人民大学（苏州）', province: '江苏省', city: '苏州市', type: 'benke' },
  { name: '东南大学（苏州校区）', province: '江苏省', city: '苏州市', type: 'benke' },
  { name: '南京大学（苏州校区）', province: '江苏省', city: '苏州市', type: 'benke' },
  { name: '河海大学常州校区', province: '江苏省', city: '常州市', type: 'benke' },
  { name: '东南大学（无锡校区）', province: '江苏省', city: '无锡市', type: 'benke' },
  { name: '哈尔滨工程大学（青岛）', province: '山东省', city: '青岛市', type: 'benke' }
];
// 校区城市错填修正（源数据误填，按教育部备案地址/学校官网确认）
const CITY_FIX = {
  '苏州科技大学天平学院': '苏州市' // 实际位于苏州市吴江区（原填南京市有误）
};
var campusReport = { added: [], fixed: [] };
(function applyCampus() {
  const nameSet = new Set(final.map(x => x.name));
  for (const c of BRANCH_CAMPUS) {
    if (nameSet.has(c.name)) continue;
    final.push({ name: c.name, city: c.city, province: c.province, type: c.type });
    nameSet.add(c.name);
    campusReport.added.push(c.name + '（' + c.province + '/' + c.city + '）');
  }
  for (const x of final) {
    if (CITY_FIX[x.name] && x.city !== CITY_FIX[x.name]) {
      campusReport.fixed.push(x.name + '：' + x.city + ' → ' + CITY_FIX[x.name]);
      x.city = CITY_FIX[x.name];
    }
  }
})();

function ser(arr) {
  return arr.map(e => {
    const keys = ['name', 'city', 'province'];
    if (e.type) keys.push('type');
    return '  {' + keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(e[k] || '')).join(',') + '}';
  }).join(',\n');
}
const header =
'// 全国高校清单（用于大学生/在校学生医保查询）\n' +
'// 字段：name 校名；city 所在地市（与 data.js 的 REAL/ADMIN 地名一致）；province 省/直辖市/自治区；\n' +
'//       type：缺省/benke=本科，vocational=高职（专科），chengren=成人高校。\n' +
'// 说明：全日制在校生（含高职专科）医保由学校统一组织，执行所在地市“大学生”档；成人高校学生一般参加职工/城乡居民医保。\n' +
'// 覆盖：主要本科院校 + 全国高职（专科）院校 + 成人高校 + 其余本科（数据源自教育部全国高等学校名单及各地公开名单）。\n' +
'//       含 2026 年度教育部新批复设置/更名/升格院校（ext_2026new.js / voc_2026new.js）。\n' +
'const UNIVERSITIES = [\n' + ser(final) + '\n];\n';

fs.writeFileSync(uniPath, header, 'utf8');
const t = {};
final.forEach(x => { const k = x.type || '本科(缺省)'; t[k] = (t[k] || 0) + 1; });
console.log('重建完成：合计', final.length, '｜分布', JSON.stringify(t));
console.log('近重名清理（全/半角括号等归一化重复）：', dropped, '条');
console.log('别名后处理：补入新校', aliasReport.added.length, '所，删除旧条目', aliasReport.removed.length, '条');
console.log('校区后处理：补收异地校区', campusReport.added.length, '所，修正城市', campusReport.fixed.length, '条');
if (campusReport.added.length) campusReport.added.forEach(x => console.log('  ＋', x));
if (campusReport.fixed.length) campusReport.fixed.forEach(x => console.log('  ※', x));
if (aliasReport.added.length) aliasReport.added.forEach(x => console.log('  ＋', x));
if (aliasReport.removed.length) aliasReport.removed.slice(0, 200).forEach(x => console.log('  －', x));
if (aliasReport.kept.length) aliasReport.kept.forEach(x => console.log('  ？', x));
console.log('各文件状态:', JSON.stringify(perFile, null, 2));
