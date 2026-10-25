# 蚂蚁哥医保查询

2027 年度城乡居民医保征缴信息查询工具。聚合各地医保局、税务局公开通告的缴费标准、咨询电话和缴费方式，覆盖全国 31 个省、338 个地级市及全部区县，另收录 3177 所高校的在校学生医保标准。

本工具为便民信息汇总，非官方经办渠道，不提供参保登记、报销申请、账户查询等医保经办服务，具体以当地医保局通告为准。

## 运行

纯静态页面，无构建依赖。直接用浏览器打开 index.html，或：

```
python -m http.server 8000
```

## 查询方式

- **查地区**：点页面上方省份标签，或在搜索框输入城市 / 区 / 县名（如「浦江」「东城区」），点搜索结果。区县无独立通告时自动继承上级标准并标注。
- **查大学**：切到「查大学」页签，输入校名，原校名也能搜（aliases.js 映射）。成人高校按城乡居民一般档显示。
- **打电话**：结果里的电话号码可点击直接拨打，外地电话需加区号。

## 文件说明

| 文件 | 说明 |
|---|---|
| index.html / style.css / app.js | 页面、适老化样式、前端逻辑 |
| data.js | 核心数据：META、全国通用缴费方式、行政区划树 ADMIN、真实征缴数据 REAL |
| universities.js | 高校库 3177 所（本科 1419 / 高职 1503 / 成人 246） |
| aliases.js | 高校旧名 → 现名映射 168 条（教育部 2024–2026 公示） |
| uni_fee.js | 94 个城市大学生医保专项标准 |
| icon/ | 小程序图标，SVG 源文件 + 各尺寸 PNG |
| merge_voc.js / _gen_alias.js / build_data.py | 数据维护脚本，页面不加载 |
| voc_*.js / ext_*.js / moe_*.xls | 高校数据源（教育部公布名单） |
| yibao-query/ | WorkBuddy skill 源码（AI 查询助手形态）：SKILL.md + scripts/query.js + data/ + references/ |
| yibao-query.zip | 官方 package_skill.py 校验通过的发布包，可导入 WorkBuddy 或上架技能库 |

数据优先级：uni_fee.js 专项标准 → 市 REAL 大学生段 → 省级兜底；区县无独立数据时逐级向上继承。

## 数据来源

各地医保局、税务局公开发布的征缴通告；教育部高等学校名单；行政区划与区号数据来自 uiwjs/province-city-china。

## 版本

v1.0.0（2026-10-24 创建）
制作人：浦江蚂蚁哥 shorver@163.com

## WorkBuddy skill 版

除网页版外，本项目还提供 AI 查询助手形态的 WorkBuddy skill（`yibao-query/`），让 WorkBuddy 在对话中直接回答医保查询问题，无需打开网页。

- 触发：问「XX 市医保怎么缴」「XX 大学学生医保多少」时自动调用
- 能力：地区查询（区县继承上级标准）、高校查询（支持旧校名别名反查）、全国通用缴费方式
- 安装：在 WorkBuddy 客户端「技能中心 → 创作者/上传」导入 `yibao-query.zip`，或把 `yibao-query/` 目录放到用户级 skills 目录（`~/.workbuddy/skills/`）
- 说明：skill 与网页版共用同一份 data.js / universities.js 等数据，`scripts/query.js` 为离线 Node 查询脚本，不联网

## 代码仓库

- Gitee：https://gitee.com/shorver/yi-bao
- GitCode：https://gitcode.net/shorver/yibao
- AtomGit：https://atomgit.com/shorver/yibao
- CNB：https://cnb.cool/shorver/yibao
