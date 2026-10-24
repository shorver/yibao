// 生成 aliases.js：合并 alias_benke.js + alias_voc.js，按新校名聚合旧名。
// 过滤纯新设校（无旧名）。运行：node _gen_alias.js
// 注意：本脚本只生成别名映射数据；据此"补新校/删旧条目"的后处理在 merge_voc.js 的别名后处理阶段完成。
const fs = require('fs');
const path = require('path');
const dir = __dirname;

function extractArray(code) {
  const m = code.match(/const\s+\w+\s*=\s*(\[[\s\S]*\])\s*;?/);
  if (!m) return null;
  try { return JSON.parse(m[1]); }
  catch (e) { try { return eval('(' + m[1] + ')'); } catch (e2) { return null; } }
}

const bk = extractArray(fs.readFileSync(path.join(dir, 'alias_benke.js'), 'utf8')) || [];
const voc = extractArray(fs.readFileSync(path.join(dir, 'alias_voc.js'), 'utf8')) || [];
console.log('本科映射源:', bk.length, '| 高职映射源:', voc.length);

const noOld = bk.concat(voc).filter(x => {
  const olds = Array.isArray(x.old) ? x.old : [x.old];
  return olds.filter(Boolean).length === 0;
});
console.log('纯新设无旧名(过滤):', noOld.length);

const byNew = {};
bk.concat(voc).forEach(x => {
  if (!x || !x.new) return;
  const olds = (Array.isArray(x.old) ? x.old : [x.old]).filter(Boolean);
  if (!olds.length) return;
  if (!byNew[x.new]) byNew[x.new] = { new: x.new, old: [], year: x.year || '', kinds: [] };
  olds.forEach(o => { if (o && byNew[x.new].old.indexOf(o) < 0) byNew[x.new].old.push(o); });
  if (x.kind && byNew[x.new].kinds.indexOf(x.kind) < 0) byNew[x.new].kinds.push(x.kind);
  if (x.year && !byNew[x.new].year) byNew[x.new].year = x.year;
});

const merged = Object.values(byNew);
console.log('聚合后有效映射:', merged.length);

// ===== 手工补充映射（EXTRA_ALIASES）=====
// 两类教育部名单外的常见检索名：
// A. 名校医学部/医学院（不单独招生、无独立学校代码，但用户习惯按学部名检索）→ 本部；
// B. 已撤销并入的校区（原建制撤销、校园并入同校其他校区，用户按旧名检索）→ 现存实体。
const EXTRA_ALIASES = [
  { new: '北京大学', old: ['北京大学医学部'], year: '', kind: '学部(不独立招生)' },
  { new: '复旦大学', old: ['复旦大学上海医学院'], year: '', kind: '学部(不独立招生)' },
  { new: '上海交通大学', old: ['上海交通大学医学院'], year: '', kind: '学部(不独立招生)' },
  { new: '华中科技大学', old: ['华中科技大学同济医学院'], year: '', kind: '学部(不独立招生)' },
  { new: '中山大学', old: ['中山大学中山医学院'], year: '', kind: '学部(不独立招生)' },
  { new: '中南大学', old: ['中南大学湘雅医学院'], year: '', kind: '学部(不独立招生)' },
  { new: '四川大学', old: ['四川大学华西医学中心'], year: '', kind: '学部(不独立招生)' },
  { new: '西安交通大学', old: ['西安交通大学医学部'], year: '', kind: '学部(不独立招生)' },
  // 北京师范大学珠海分校 2021 年终止办学、2024 年教育部撤销建制，校园并入北京师范大学（珠海校区）
  { new: '北京师范大学（珠海校区）', old: ['北京师范大学珠海分校'], year: 2024, kind: '撤销并入' }
];
let extraAdded = 0;
EXTRA_ALIASES.forEach(x => {
  if (!merged.some(m => m.new === x.new && m.old.some(o => x.old.indexOf(o) >= 0))) {
    const ex = merged.find(m => m.new === x.new);
    if (ex) { x.old.forEach(o => { if (ex.old.indexOf(o) < 0) ex.old.push(o); }); if (ex.kinds.indexOf(x.kind) < 0) ex.kinds.push(x.kind); }
    else merged.push({ new: x.new, old: x.old.slice(), year: x.year, kinds: [x.kind] });
    extraAdded++;
  }
});
console.log('手工补充映射:', extraAdded, '条');

// 校验：新校名应存在于 UNIVERSITIES
const U = new Function(fs.readFileSync(path.join(dir, 'universities.js'), 'utf8') + '; return UNIVERSITIES;')();
const names = new Set(U.map(x => x.name));
const notFound = merged.filter(m => !names.has(m.new));
console.log('新校名不在 UNIVERSITIES 的映射:', notFound.length, '条（应由 merge_voc.js 别名后处理补入）');

// 校验：旧名不应与现存校名冲突（旧名本身也是现名校会导致歧义）
const conflict = merged.filter(m => m.old.some(o => names.has(o)));
console.log('旧名与现存校名冲突:', conflict.length, '条（应由 merge_voc.js 删除旧条目）');

function q(s) { return JSON.stringify(String(s)); }
const lines = merged.map(m =>
  '  {' + q('new') + ':' + q(m.new) + ',' + q('old') + ':' + JSON.stringify(m.old) +
  ',' + q('year') + ':' + q(m.year) + ',' + q('kind') + ':' + q(m.kinds.join('/')) + '}'
).join(',\n');

const header =
  '// 院校旧名别名映射（"查大学"页签按旧校名检索用）\n' +
  '// 字段：new 现行规范校名；old 旧校名数组（2023年及以前名称）；year 变更年度；kind 变更类型（更名/升格/转设/合并/新设）。\n' +
  '// 来源：教育部历年《关于拟同意设置本科/专科高等学校的公示》及批复函（2024—2026年度，moe.gov.cn）。\n' +
  '// 注意：由 _gen_alias.js 从 alias_benke.js + alias_voc.js 聚合生成（含脚本内 EXTRA_ALIASES 手工补充），请勿手改；重新生成：node _gen_alias.js\n' +
  'const ALIASES = [\n' + lines + '\n];\n';

fs.writeFileSync(path.join(dir, 'aliases.js'), header, 'utf8');
console.log('已写出 aliases.js，共', merged.length, '条映射');
