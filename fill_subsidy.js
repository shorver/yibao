// 逐省填充 subsidy 字段：给 31 个大陆省级 REAL 条目（除已存在的浙江省）写入
// 基于国家医疗救助统一框架的省份说明（不编各省具体定额金额，以当地通告为准）。
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'data.js');
let src = fs.readFileSync(file, 'utf8');

// 加载 REAL 以确定哪些省份已有 subsidy
const REAL = new Function(src + '\nreturn {REAL:REAL, SUBSIDY_DEFAULT:SUBSIDY_DEFAULT};')().REAL;

const PROV = ['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','重庆市','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区'];

function esc(s) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

let added = 0, skipped = 0;
PROV.forEach(function (p) {
  const entry = REAL[p];
  if (!entry) { console.log('  跳过(无REAL条目): ' + p); return; }
  if (entry.subsidy) { skipped++; return; } // 已有（如浙江省）
  const text = p + '对困难群众参加城乡居民医保给予参保资助：特困人员、孤儿、事实无人抚养儿童等，其个人缴费由医疗救助资金（或财政）给予全额资助（个人免缴）；低保对象、低保边缘家庭成员、重度残疾人（一、二级）、防止返贫监测对象等，享受定额资助，具体资助标准由' + p + '及所辖地区医保、民政部门2027年度通告确定。部分市县对优抚对象、计划生育特殊家庭、高龄老人等可额外资助，以当地最新通告为准。';
  const key = '"' + p + '":{';
  const idx = src.indexOf(key);
  if (idx < 0) { console.log('  未找到键: ' + p); return; }
  const insertAt = idx + key.length;
  src = src.slice(0, insertAt) + '"subsidy":"' + esc(text) + '",' + src.slice(insertAt);
  added++;
});

fs.writeFileSync(file, src);
console.log('\n完成：新增 subsidy 的省份 ' + added + ' 个，跳过已有 ' + skipped + ' 个。');
