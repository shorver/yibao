#!/usr/bin/env node
'use strict';
// 蚂蚁哥医保查询 skill — 离线查询脚本（不联网，纯本地数据）
// 用法：
//   node query.js 地区 金华
//   node query.js 地区 浦江县
//   node query.js 大学 浙江大学
//   node query.js 大学 淮阴工学院      (自动转现名 淮安大学)
//   node query.js 全国

const fs = require('fs');
const path = require('path');

// 网页版项目目录：本地唯一权威数据源（与医保网页版同源）。
// 可通过环境变量 YIBAO_PROJECT_DIR 覆盖；默认指向本机医保网页版项目。
const PROJECT_DIR = process.env.YIBAO_PROJECT_DIR
  || 'D:/我的文档/WorkBuddy/医保';
// skill 自带 data 目录：仅作分发 / 离线兜底，非本地权威源。
const SKILL_DATA = path.join(__dirname, '..', 'data');

function resolveFile(file) {
  const cands = [path.join(PROJECT_DIR, file), path.join(SKILL_DATA, file)];
  for (const p of cands) if (fs.existsSync(p)) return p;
  return null;
}
function loadVars(file, vars) {
  const p = resolveFile(file);
  if (!p) throw new Error('数据文件未找到: ' + file);
  const code = fs.readFileSync(p, 'utf8');
  const expr = code + '\nreturn {' + vars.map(v => v + ':' + v).join(',') + '};';
  return new Function(expr)();
}

// 优先 data.json（网页版与 skill 共用的单一权威数据源）；
// 回退到分散的 data.js / universities.js / aliases.js / uni_fee.js。
function loadBundle() {
  const jsonCands = [path.join(PROJECT_DIR, 'data.json'), path.join(SKILL_DATA, 'data.json')];
  for (const p of jsonCands) {
    if (fs.existsSync(p)) {
      const bundle = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { bundle, src: p };
    }
  }
  const bundle = Object.assign(
    loadVars('data.js', ['META', 'NATIONAL', 'ADMIN', 'REAL', 'SUBSIDY_DEFAULT']),
    loadVars('universities.js', ['UNIVERSITIES']),
    loadVars('aliases.js', ['ALIASES']),
    loadVars('uni_fee.js', ['UNI_FEE'])
  );
  return { bundle, src: '分散的 data.js 等（JS 回退）' };
}

const { bundle: B, src: BUNDLE_SRC } = loadBundle();
const META = B.META, NATIONAL = B.NATIONAL, ADMIN = B.ADMIN, REAL = B.REAL;
const UNIVERSITIES = B.UNIVERSITIES, ALIASES = B.ALIASES, UNI_FEE = B.UNI_FEE;
const SUBSIDY_DEFAULT = B.SUBSIDY_DEFAULT || '特困人员、低保对象、低保边缘家庭成员、重度残疾人、孤儿、事实无人抚养儿童等困难群众参加城乡居民医保，其个人缴费部分通常由医疗救助资金或财政给予全额或定额资助（即个人免缴或少缴）；具体资助对象范围与个人缴费标准由各地医保、民政部门确定，以当地最新通告为准。';

const YEAR = META.year || '2027年度';

// ---------- 工具 ----------
function strip(s) { return (s || '').trim().replace(/[省市区县]$/, ''); }
function normCands(name) {
  const r = name.trim();
  const s = strip(r);
  return [...new Set([r, s, s + '市', s + '县', s + '区', s + '省', r + '市', r + '县', r + '区'])];
}

// ---------- 地区定位 + 继承 ----------
const locMap = {};
for (const p of ADMIN) {
  const pv = p.name;
  for (const c of (p.children || [])) {
    if (!locMap[c.name]) locMap[c.name] = { province: pv, city: null };
    locMap[c.name].province = pv;
    if (c.children) {
      for (const d of c.children) locMap[d.name] = { province: pv, city: c.name };
    }
  }
}

function findRealDirect(name) {
  for (const c of normCands(name)) { if (REAL[c]) return { key: c, data: REAL[c] }; }
  const r = name.trim();
  const hit = Object.keys(REAL).find(k => k.includes(r));
  if (hit) return { key: hit, data: REAL[hit] };
  return null;
}

function resolveRegion(name) {
  const direct = findRealDirect(name);
  if (direct) return { mode: 'direct', key: direct.key, data: direct.data };
  let info = null, matched = null;
  for (const c of normCands(name)) { if (locMap[c]) { info = locMap[c]; matched = c; break; } }
  if (!info) {
    const r = name.trim();
    const fuzzy = Object.keys(locMap).find(k => k.includes(r));
    if (fuzzy) { info = locMap[fuzzy]; matched = fuzzy; }
  }
  if (!info) return null;
  let data = null, src = null;
  if (info.city && REAL[info.city]) { data = REAL[info.city]; src = info.city; }
  else if (REAL[info.province]) { data = REAL[info.province]; src = info.province; }
  if (!data) return null;
  return { mode: 'inherit', key: matched, city: info.city, province: info.province, data, src };
}

// ---------- 高校定位 ----------
function findUniv(name) {
  const r = name.trim();
  let u = UNIVERSITIES.find(x => x.name === r)
    || UNIVERSITIES.find(x => x.name.includes(r) || r.includes(x.name));
  let alias = null;
  if (!u) {
    const a = ALIASES.find(x => (x.old || []).some(o => o === r || o.includes(r) || r.includes(o)));
    if (a) { u = UNIVERSITIES.find(x => x.name === a.new); alias = a; }
  }
  if (!u) return null;
  return { univ: u, alias };
}

function univFee(u) {
  const city = u.city, pv = u.province;
  if (UNI_FEE[city]) return { src: city, data: UNI_FEE[city] };
  if (REAL[city]) return { src: city, data: REAL[city], fallback: true };
  if (REAL[pv]) return { src: pv, data: REAL[pv], fallback: true };
  return null;
}

// ---------- 输出 ----------
function field(label, val) {
  if (!val) return '';
  return label + '：' + val + '\n';
}

// 资助参保对象：沿 自身→市→省 继承，命中即用，否则用全国默认说明
function subsidyOf(names) {
  for (const n of names) { if (REAL[n] && REAL[n].subsidy) return REAL[n].subsidy; }
  return SUBSIDY_DEFAULT;
}
function regionSubsidy(res) {
  const chain = [];
  if (res.mode === 'direct') {
    chain.push(res.key);
    const info = locMap[res.key];
    if (info && info.province) chain.push(info.province);
  } else {
    if (res.city) chain.push(res.city);
    if (res.province) chain.push(res.province);
  }
  return subsidyOf(chain);
}
function typeLabel(t) {
  return { '': '(本科)', benke: '(本科)', vocational: '(高职/专科)', chengren: '(成人高校)' }[t] || '(本科)';
}

function renderRegion(res) {
  const d = res.data;
  let out = '';
  const title = res.mode === 'direct' ? res.key : (res.key + '（继承 ' + res.src + ' 标准）');
  out += '【' + YEAR + ' ' + title + ' 城乡居民医保征缴信息】\n';
  out += field('个人缴费标准', d.fee);
  out += field('集中征缴期', d.period);
  out += field('医保咨询电话', d.medical);
  out += field('税务缴费电话', d.tax);
  out += field('线上缴费方式', d.online);
  out += field('线下缴费方式', d.offline);
  out += field('资助参保对象', regionSubsidy(res));
  out += field('备注', d.note);
  out += field('数据来源', (d.source || '各地医保局/税务局公开通告'));
  return out;
}

function renderUniv(res) {
  const u = res.univ;
  const f = univFee(u);
  let out = '';
  out += '【' + YEAR + ' 高校在校学生医保 — ' + u.name + '】\n';
  if (res.alias) out += '（校名说明：原名“' + res.alias.old.join('、') + '”，' + res.alias.year + '年' + res.alias.kind + '为现名）\n';
  out += '所在地：' + u.province + ' ' + u.city + '\n';
  out += '学校类型：' + typeLabel(u.type) + '\n';
  if (!f) {
    out += '未查到该地专项大学生医保标准，请按所在地市城乡居民标准或咨询学校。\n';
  } else {
    const d = f.data;
    out += field('缴费标准', d.fee);
    out += field('征缴期', d.period);
    out += field('参保/缴费方式', d.online);
    out += field('资助参保对象', subsidyOf([u.city, u.province]));
    out += field('备注', d.note);
    out += field('数据来源', (d.source || '各地医保局/税务局/高校官网公开通告'));
    if (f.fallback) out += '（说明：未单列独立的大学生专项通告，下列为所在地市城乡居民医保标准，若当地有在校学生专门档已一并列出，实际以学校通知为准）\n';
  }
  return out;
}

function footer() {
  return '\n————————————\n数据更新时间：' + META.update +
    '\n本工具为便民信息汇总，非官方经办渠道，不提供参保登记、报销申请、账户查询等医保经办服务，具体以当地医保局通告为准。\n' +
    '数据来源：各地医保局、税务局公开发布的 ' + YEAR + ' 征缴通告与政策文件。';
}

function help() {
  return '用法：\n' +
    '  node query.js 地区 <省/市/区/县名>   例如：node query.js 地区 金华\n' +
    '  node query.js 大学 <校名>           例如：node query.js 大学 浙江大学\n' +
    '  node query.js 全国                 列出全国通用缴费方式\n' +
    '作者：浦江蚂蚁哥（' + META.contact + '）';
}

// ---------- 主入口 ----------
const mode = process.argv[2];
const q = process.argv.slice(3).join(' ').trim();

if (!mode || mode === 'help' || mode === '-h' || mode === '--help') {
  console.log(help()); process.exit(0);
}
if (mode === '数据源' || mode === 'source') {
  let out = '【蚂蚁哥医保查询 — 数据加载来源】\n';
  out += '  主数据源：' + (BUNDLE_SRC || '(未加载)') + '\n';
  for (const f of ['data.json', 'data.js']) {
    const p = resolveFile(f);
    if (p) out += '  ✓ ' + f + '  ->  ' + p + '\n';
  }
  out += '\n网页版项目目录（可用环境变量 YIBAO_PROJECT_DIR 覆盖）：\n  ' + PROJECT_DIR + '\n';
  out += '说明：本地优先读取网页版项目 data.json（单一权威数据源），skill 自带 data/data.json 仅作分发/离线兜底。';
  console.log(out); process.exit(0);
}
if (mode === '全国' || mode === 'national') {
  let out = '【' + YEAR + ' 全国通用缴费方式】\n';
  for (const n of NATIONAL) out += '· ' + n.name + '：' + n.desc + '\n';
  console.log(out + footer());
  process.exit(0);
}
if (!q) { console.log('未提供查询词。\n' + help()); process.exit(1); }

if (mode === '地区' || mode === 'region') {
  const res = resolveRegion(q);
  if (!res) {
    console.log('未找到“' + q + '”对应的医保数据。可尝试用更完整的地名（如“金华市”“浦江县”），或查询其所属上级市/省。\n' + footer());
    process.exit(0);
  }
  console.log(renderRegion(res) + footer());
} else if (mode === '大学' || mode === 'univ' || mode === '高校') {
  const res = findUniv(q);
  if (!res) {
    console.log('未找到“' + q + '”对应的高校。可检查校名，或尝试旧校名（本工具含 2023 年以来更名/升格/转设院校别名）。\n' + footer());
    process.exit(0);
  }
  console.log(renderUniv(res) + footer());
} else {
  console.log('未知查询类型：“' + mode + '”。\n' + help()); process.exit(1);
}
