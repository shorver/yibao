// 医保/税务热线字段清洗：删除批量生成的「区号+12393/12366」模板号码与误导性文案，
// 统一改为官方可核验的 12345 / 12366 口径；保留各地已核实的真实办公固话。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'data.js');
const src = fs.readFileSync(file, 'utf8');

function loadVar(code, name) {
  return new Function(code + '\nreturn ' + name + ';')();
}
const REAL = loadVar(src, 'REAL');
const keys = Object.keys(REAL);

const M_FALLBACK = '12345（政务服务便民热线，异地拨打加区号）；医保专线以当地医保局公布为准';
const T_FALLBACK = '12366（纳税缴费服务热线）；或 12345（异地拨打加区号）';

// 判断一段是否含真实号码（8位固话、400号、带业务注释的本地号）
function segmentKeep(seg, kind) {
  let s = seg.trim().replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
  if (!s) return null;
  // 模板短号：区号+12393 / 区号+12366（丢弃）
  if (/^0\d{2,3}-12393$/.test(s) || /^0\d{2,3}-12366$/.test(s)) return null;
  // 裸短号 12393/12366：兜底文案已说明，不重复
  if (/^12393$/.test(s) || /^12366$/.test(s)) return null;
  // 区号+12345：官方口径有效，保留（去掉「转医保」等后缀）
  if (/^0\d{2,3}-12345/.test(s)) return s.replace(/转.*$/, '');
  if (/^12345/.test(s)) return '12345';
  return seg.trim(); // 真实固话 / 400 号 / 带注释的号码，原样保留
}

function clean(v, kind) {
  if (!v) return kind === 'm' ? M_FALLBACK : T_FALLBACK;
  const segs = v.split(/\s*\/\s*/);
  const kept = [];
  for (const seg of segs) {
    const k = segmentKeep(seg, kind);
    if (k) kept.push(k);
  }
  // 去重
  const uniq = kept.filter((x, i) => kept.indexOf(x) === i);
  const hasReal = uniq.some(x => /\d{7,8}/.test(x) || /^400\d+/.test(x));
  if (kind === 'm') {
    if (hasReal) return uniq.join(' / ') + ' / 12345（异地加区号）';
    if (uniq.length) return uniq.join(' / ') + '（政务服务便民热线，异地可拨）';
    return M_FALLBACK;
  }
  if (hasReal) return uniq.join(' / ') + ' / 12366 或 12345';
  if (uniq.length) return uniq.join(' / ') + ' / 12366';
  return T_FALLBACK;
}

const newVals = {};
for (const k of keys) {
  newVals[k] = { m: clean(REAL[k].medical, 'm'), t: clean(REAL[k].tax, 't') };
}

// 按出现顺序定位并替换字段值
function replaceFields(text, field, getValue) {
  const re = new RegExp('"' + field + '":"[^"]*"', 'g');
  let idx = 0, count = 0;
  const out = text.replace(re, () => {
    const k = keys[idx++];
    count++;
    return '"' + field + '":"' + getValue(k) + '"';
  });
  if (count !== keys.length) throw new Error(field + ' 匹配数 ' + count + ' != 节点数 ' + keys.length);
  return out;
}

let out = replaceFields(src, 'medical', k => newVals[k].m);
out = replaceFields(out, 'tax', k => newVals[k].t);

fs.writeFileSync(file, out);

// 统计
let changedM = 0, changedT = 0, realM = 0, realT = 0;
for (const k of keys) {
  if (REAL[k].medical !== newVals[k].m) changedM++;
  if (REAL[k].tax !== newVals[k].t) changedT++;
  if (/\d{7,8}/.test(newVals[k].m)) realM++;
  if (/\d{7,8}/.test(newVals[k].t)) realT++;
}
console.log('节点数:', keys.length);
console.log('medical 修改:', changedM, '| tax 修改:', changedT);
console.log('保留真实固话：medical', realM, '个节点 / tax', realT, '个节点');
console.log('残留「区号-12393」:', (out.match(/0\d{2,3}-12393/g) || []).length);
console.log('残留「区号-12366」:', (out.match(/0\d{2,3}-12366/g) || []).length);
console.log('样例（宿州市）:', newVals['宿州市'].m, '|', newVals['宿州市'].t);
console.log('样例（浦江县）:', newVals['浦江县'].m, '|', newVals['浦江县'].t);
