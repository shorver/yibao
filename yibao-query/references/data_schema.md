# 数据字段说明

数据位于 skill 的 `data/` 目录，均为纯数据 JS 文件（含 `const` 声明），由 `scripts/query.js` 通过 `new Function` 加载，无需浏览器环境。

## data.js
- **META**：元信息 `{title, year, version, createTime, update, author, contact, disclaimer, tip}`
- **NATIONAL**：全国通用缴费方式数组 `[{name, desc}]`
- **ADMIN**：行政区划树，结构为 `[{code, name, children:[{code, name, children?:[...]}]}]`，省→市→区县三级（直辖市省下直接为区）
- **REAL**：真实医保数据覆盖层，`{ "标准地名": {level, medical, tax, fee, period, online, offline, note, source} }`
  - `level`：行政区划级别（province/city/...）
  - `medical`：医保咨询电话（带区号）
  - `tax`：税务缴费电话（带区号）
  - `fee`：个人缴费标准
  - `period`：集中征缴期
  - `online`：线上缴费方式
  - `offline`：线下缴费方式
  - `note`：备注
  - `source`：数据来源

## universities.js
- **UNIVERSITIES**：高校数组 `[{name, province, city, type}]`
  - `type` 缺省或 `benke`=本科；`vocational`=高职(专科)；`chengren`=成人高校
  - `city` 与 REAL/UNI_FEE 地名一致（带「市」后缀）

## uni_fee.js
- **UNI_FEE**：高校所在地市大学生专项标准 `{ "市名": {fee, period, online, note, source} }`
  - 已覆盖 94 个已公布城市；其余城市在查询时回退到所在地市城乡居民标准并注明

## aliases.js
- **ALIASES**：院校旧名别名映射 `[{new, old:[...], year, kind}]`
  - `new`：现行规范校名；`old`：旧校名数组；`year`：变更年度；`kind`：更名/升格/转设/合并/新设
