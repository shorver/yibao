---
name: yibao-query
display_name: 蚂蚁哥医保查询
display_name_en: AntGe Medical Insurance Query
description: 蚂蚁哥医保查询助手，聚合2027年度各地医保局/税务局公开的城乡居民医保缴费标准、咨询电话、缴费方式及高校在校生医保标准，非官方经办渠道。
description_zh: 蚂蚁哥医保查询助手：聚合2027年度全国城乡居民医保征缴信息（缴费标准、咨询电话、缴费方式、征缴期）及高校在校生医保标准，支持按省/市/区县和高校查询。非官方经办渠道，不提供参保登记、报销、账户查询等经办服务。
description_en: AntGe medical insurance query assistant. Aggregates publicly released 2027 urban-rural residents basic medical insurance payment standards, hotlines, payment methods, and university student insurance fees across China. Not an official channel.
examples_zh:
  - "金华市2027年居民医保要交多少钱"
  - "浦江县医保咨询电话是多少"
  - "浙江大学学生医保怎么交"
examples_en:
  - "How much is residents medical insurance in Jinhua for 2027"
  - "What is the medical insurance hotline for Pujiang County"
  - "How do Zhejiang University students pay medical insurance"
version: 1.0.6
author: 浦江蚂蚁哥
agent_created: true
---

# 蚂蚁哥医保查询助手

## 用途
聚合 2027 年度各地医保局、税务局公开发布的城乡居民医保征缴信息（缴费标准、咨询电话、缴费方式、征缴期），以及高校在校学生医保专项标准。本工具为便民信息汇总，**非官方经办渠道**，不提供参保登记、报销申请、个人账户查询等任何医保经办服务。

## 何时使用
- 用户问「XX 市/县/区 医保怎么缴」「XX 居民医保多少钱」「XX 医保电话」「XX 医保什么时候交」
- 用户问「XX 大学 学生医保」「大学生医保标准」
- 用户问全国通用缴费方式（微信/支付宝/电子税务局/12393 等）

## 使用方法
调用本 skill 的查询脚本（Node.js，纯本地数据，无需联网）：

```bash
# 查地区（省 / 市 / 区县，可省略「市/县/区/省」后缀）
node scripts/query.js 地区 金华
node scripts/query.js 地区 浦江县
node scripts/query.js 地区 北京市

# 查高校（支持旧校名自动转现名，覆盖 2023 年以来更名/升格/转设院校）
node scripts/query.js 大学 浙江大学
node scripts/query.js 大学 淮阴工学院      # 自动识别为 淮安大学

# 查全国通用缴费方式
node scripts/query.js 全国
```

脚本输出完整中文报告（缴费标准、电话、方式、数据来源、更新时间与免责声明），直接据此组织回答即可，无需再联网检索。

## 数据来源与查询规则
- 数据来自四个文件，结构见 `references/data_schema.md`。
- **统一数据源**：脚本运行时**优先读取网页版项目目录**（`D:\我的文档\WorkBuddy\医保\` 下的 data.js / universities.js / aliases.js / uni_fee.js）。本地只有这一份权威数据——改网页版数据，skill 自动同步，无需手动同步。可用环境变量 `YIBAO_PROJECT_DIR` 覆盖网页版路径；或运行 `node scripts/query.js 数据源` 查看当前各文件实际加载路径。
- **分发兜底**：随 skill 打包的 `data/` 目录仅作分发/离线兜底——当网页版项目不存在（如他人安装此 skill）时自动回退使用，保证独立可用。重新打包上架前，请将网页版最新的四个数据文件复制到 `data/` 目录，再执行打包。
- **地区查询**：优先返回该地独立数据；若某区县无独立通告，自动继承其所属市/省标准，并在标题标注「继承 XX 标准」。查询结果含该地医保咨询电话、税务缴费电话（均带区号）、线上线下缴费方式、备注与数据来源。
- **高校查询**：按校名精确/模糊匹配；未命中时查 `aliases.js` 的旧校名→现名映射；再取其所在地市的 `uni_fee.js` 大学生专项标准。大学生专项标准已覆盖 94 个已公布城市；其余城市回退到所在地市城乡居民一般标准并注明「以学校通知为准」。
- **数据年度**：2027 年度，集中征缴期多为 2026 年 9—12 月（具体以当地最新通告为准）。

## 合规要求（必须保留）
- 回答中必须保留「非官方经办渠道，具体以当地医保局通告为准」的声明。
- 不得声称本工具具有官方资质，或能提供参保登记、报销、账户查询等经办服务。
- 数据随各地通告调整而变化，应提示用户以当地最新官方通告为准。

## 数据维护
本地数据与网页版同源、单一来源（见「统一数据源」）。改网页版 `D:\我的文档\WorkBuddy\医保\` 下的四个数据文件即可，skill 下次运行自动读取，无需改动脚本。如需重新打包上架，请将网页版最新的四个数据文件复制到本 skill 的 `data/` 目录（兜底副本），再用官方 `package_skill.py` 打包；保持变量名不变（`META`/`NATIONAL`/`ADMIN`/`REAL`、`UNIVERSITIES`、`ALIASES`、`UNI_FEE`）。

## 作者与授权
制作人：浦江蚂蚁哥（shorver@163.com）。本 skill 为便民信息汇总工具，可自由分发，但不得冒充官方医保经办机构。
