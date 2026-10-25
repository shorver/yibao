// 一次性脚本：给 data.js 精确插入 subsidy 字段与 SUBSIDY_DEFAULT 全局
// 仅运行一次，运行后可删除
const fs = require('fs');
const p = 'D:/我的文档/WorkBuddy/医保/data.js';
let s = fs.readFileSync(p, 'utf8');

const DEFAULT = '特困人员、低保对象、低保边缘家庭成员、重度残疾人、孤儿、事实无人抚养儿童等困难群众参加城乡居民医保，其个人缴费部分通常由医疗救助资金或财政给予全额或定额资助（即个人免缴或少缴）；具体资助对象范围与个人缴费标准由各地医保、民政部门确定，以当地最新通告为准。';
const ZJ = '浙江省困难群众（特困人员、低保对象、低保边缘家庭成员、重度残疾人、孤儿、事实无人抚养儿童等）参加城乡居民医保，其个人缴费部分由财政给予全额资助（个人免缴）；资助对象认定与具体标准以当地医保、民政部门最新通告为准。';

// 1) 在 META 之后插入 SUBSIDY_DEFAULT 全局（若尚未存在）
if (!s.includes('SUBSIDY_DEFAULT')) {
  const marker = 'const NATIONAL = [';
  s = s.replace(marker, 'const SUBSIDY_DEFAULT = ' + JSON.stringify(DEFAULT) + ';\n\n' + marker);
}

// 2) 给浙江链条目插入 subsidy（若尚未有 subsidy）
const zjKeys = ['浙江省', '金华市', '浦江县', '义乌市', '东阳市', '兰溪市', '永康市', '武义县'];
zjKeys.forEach(function (k) {
  var re = new RegExp('"' + k + '":\\{"level"');
  var hasSub = new RegExp('"' + k + '":\\{"subsidy"');
  if (re.test(s) && !hasSub.test(s)) {
    s = s.replace(re, '"' + k + '":{"subsidy":' + JSON.stringify(ZJ) + ',"level"');
  }
});

fs.writeFileSync(p, s);
console.log('data.js 已更新：SUBSIDY_DEFAULT ' + (s.includes('SUBSIDY_DEFAULT') ? '已插入' : '失败') +
  '；浙江链条目 subsidy 已处理。');
