// 将分散的数据文件合并导出为 data.json（网页版与 skill 共用的单一权威数据源）
// 用法：node build_json.js
// 说明：data.js 用 const 声明 META/NATIONAL/ADMIN/REAL；
//       universities.js -> UNIVERSITIES；aliases.js -> ALIASES；uni_fee.js -> UNI_FEE
const fs = require('fs');
const path = require('path');

function loadVars(file, vars) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const expr = code + '\nreturn {' + vars.map(function (v) { return v + ':' + v; }).join(',') + '};';
  return new Function(expr)();
}

const bundle = Object.assign(
  loadVars('data.js', ['META', 'NATIONAL', 'ADMIN', 'REAL', 'SUBSIDY_DEFAULT']),
  loadVars('universities.js', ['UNIVERSITIES']),
  loadVars('aliases.js', ['ALIASES']),
  loadVars('uni_fee.js', ['UNI_FEE'])
);

const out = path.join(__dirname, 'data.json');
fs.writeFileSync(out, JSON.stringify(bundle));
const stat = fs.statSync(out);
console.log('data.json 已生成：' + (stat.size / 1024).toFixed(1) + ' KB');
['META', 'NATIONAL', 'ADMIN', 'REAL', 'SUBSIDY_DEFAULT', 'UNIVERSITIES', 'ALIASES', 'UNI_FEE'].forEach(function (k) {
  const v = bundle[k];
  const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : '?');
  console.log('  ' + k + ': ' + n);
});
