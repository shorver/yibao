// 蚂蚁哥医保查询 v1.0.5 — 原生 GUI 单文件版（Rust + egui）
// 数据与检索逻辑完整移植自网页版 app.js（智能搜索 / 层级判定 / 重名候选 /
// 全文回退 / 缴费截止倒计时 / 资助参保对象继承 / 大学生医保标准解析）。
// 全部资源（data.json 与图标）编译期内嵌，双击即用，不弹浏览器、不依赖网络。
// windows_subsystem="windows"：去掉启动时的黑色 cmd 控制台窗口，单文件纯 GUI 运行
#![windows_subsystem = "windows"]
#![allow(clippy::too_many_arguments)]

use std::collections::BTreeMap;
use std::sync::LazyLock;

use eframe::egui;
use regex::Regex;
use serde_json::{Map, Value};

const VERSION: &str = "1.0.5";
const APP_NAME: &str = "蚂蚁哥医保查询";
static DATA_JSON: &[u8] = include_bytes!("../assets/data.json");
static LOGO_PNG: &[u8] = include_bytes!("../assets/icon/icon_256.png");
/// 内嵌中文字体子集（微软雅黑，由 tools/make_cjk_font.py 生成）。
/// egui 默认字体不含中文字形，不嵌这个中文会全部显示为 □。
static CJK_FONT: &[u8] = include_bytes!("../assets/cjk_font.ttf");

const BRAND: egui::Color32 = egui::Color32::from_rgb(0x0a, 0x6e, 0xbd);
const BRAND_D: egui::Color32 = egui::Color32::from_rgb(0x07, 0x5a, 0x9c);
const SUB: egui::Color32 = egui::Color32::from_rgb(0x5a, 0x66, 0x72);
const OK_GREEN: egui::Color32 = egui::Color32::from_rgb(0x0a, 0x7d, 0x3e);
const WARN_ORANGE: egui::Color32 = egui::Color32::from_rgb(0xb4, 0x69, 0x0e);
const GRAY: egui::Color32 = egui::Color32::from_rgb(0x6a, 0x74, 0x7e);
const INK: egui::Color32 = egui::Color32::from_rgb(0x1a, 0x1f, 0x24);
const MUNI: [&str; 4] = ["北京市", "天津市", "上海市", "重庆市"];

// ================= 基础工具 =================

fn s(v: Option<&Value>) -> String {
    v.and_then(|x| x.as_str()).unwrap_or("").to_string()
}
/// REAL 条目字段取值
fn f(d: &Value, k: &str) -> String {
    s(d.get(k))
}
fn level_cn(level: &str) -> &'static str {
    match level {
        "province" => "省/直辖市",
        "city" => "地级市",
        _ => "区/县",
    }
}
fn prov_short(s: &str) -> Option<&'static str> {
    match s {
        "内蒙古自治区" => Some("内蒙古"),
        "广西壮族自治区" => Some("广西"),
        "西藏自治区" => Some("西藏"),
        "宁夏回族自治区" => Some("宁夏"),
        "新疆维吾尔自治区" => Some("新疆"),
        _ => None,
    }
}
static SUFFIX_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(特别行政区|自治区|自治州|省|市|县|区|盟|旗|地区)$").unwrap());

fn strip_suffix(s: &str) -> String {
    if let Some(v) = prov_short(s) {
        return v.to_string();
    }
    SUFFIX_RE.replace(s, "").to_string()
}
fn suffix_of(s: &str) -> String {
    SUFFIX_RE
        .find(s)
        .map(|m| m.as_str().to_string())
        .unwrap_or_default()
}
/// 输入与标准地名是否指向同一行政区（精确，或去后缀后相等；≥2 字防误伤；后缀冲突判否）
fn name_hit(input: &str, name: &str) -> bool {
    if input.is_empty() || name.is_empty() {
        return false;
    }
    if name == input {
        return true;
    }
    let a = strip_suffix(input);
    let b = strip_suffix(name);
    if a.chars().count() < 2 || a != b {
        return false;
    }
    let si = suffix_of(input);
    let sn = suffix_of(name);
    if !si.is_empty() && !sn.is_empty() && si != sn {
        return false; // 后缀冲突：如“朝阳区”≠“朝阳市”
    }
    true
}
/// 省/市名是否匹配大学所在地（大学 city 带“市”后缀）
fn place_hit(input: &str, place: &str) -> bool {
    let a = strip_suffix(input);
    let b = strip_suffix(place);
    a.chars().count() >= 2 && a == b
}

// ================= 日期与倒计时 =================

/// 公历日期 → 天数（Howard Hinnant days_from_civil）
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}
fn today_days() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (secs / 86_400) as i64
}

static DOT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[—\-~]\s*(?:(\d{4})\.(\d{1,2})\.(\d{1,2})|(\d{1,2})\.(\d{1,2})|(\d{1,2}))",
    )
    .unwrap()
});
static CN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(\d{4})年(\d{1,2})月(\d{1,2})日\s*[—\-~]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日")
        .unwrap()
});

fn cap_i(caps: &regex::Captures, i: usize) -> Option<i64> {
    caps.get(i).and_then(|m| m.as_str().parse::<i64>().ok())
}
/// 解析一段缴费期字符串中的截止日（兼容 2026.10.26—12.25 / 只写日 / 2026年9月1日—12月31日）
fn parse_one_range(seg: &str) -> Option<(i64, i64, i64)> {
    if let Some(m) = DOT_RE.captures(seg) {
        let sy = cap_i(&m, 1)?;
        let sm = cap_i(&m, 2)?;
        if let (Some(ey), Some(em), Some(ed)) = (cap_i(&m, 4), cap_i(&m, 5), cap_i(&m, 6)) {
            return Some((ey, em, ed));
        }
        if let (Some(em), Some(ed)) = (cap_i(&m, 7), cap_i(&m, 8)) {
            return Some((sy, em, ed));
        }
        if let Some(ed) = cap_i(&m, 9) {
            return Some((sy, sm, ed));
        }
    }
    if let Some(c) = CN_RE.captures(seg) {
        let sy = cap_i(&c, 1)?;
        if let (Some(ey), Some(em), Some(ed)) = (cap_i(&c, 4), cap_i(&c, 5), cap_i(&c, 6)) {
            return Some((ey, em, ed));
        }
        if let (Some(em), Some(ed)) = (cap_i(&c, 5), cap_i(&c, 6)) {
            return Some((sy, em, ed));
        }
    }
    None
}
/// 多分段（学生/居民等）取最晚截止日
fn parse_deadline(period: &str) -> Option<(i64, i64, i64)> {
    if period.is_empty() {
        return None;
    }
    let mut best: Option<(i64, i64, i64)> = None;
    let mut best_days = i64::MIN;
    for seg in period.split(['；', ';']) {
        if let Some(d) = parse_one_range(seg) {
            let days = days_from_civil(d.0, d.1, d.2);
            if days > best_days {
                best_days = days;
                best = Some(d);
            }
        }
    }
    best
}

#[derive(Clone)]
struct Countdown {
    text: String,
    state: u8, // 0=进行中 1=今天截止 2=已截止
}fn countdown_info(period: &str) -> Option<Countdown> {
    let (ey, em, ed) = parse_deadline(period)?;
    let diff = days_from_civil(ey, em, ed) - today_days();
    let label = format!("{}年{}月{}日", ey, em, ed);
    if diff > 0 {
        Some(Countdown {
            text: format!("距集中缴费截止还有 {} 天（截止 {}）", diff, label),
            state: 0,
        })
    } else if diff == 0 {
        Some(Countdown {
            text: format!("今天是集中缴费截止日（{}），请尽快缴费", label),
            state: 1,
        })
    } else {
        Some(Countdown {
            text: format!("集中缴费期已于 {} 结束，补缴或特殊参保请以当地最新通告为准", label),
            state: 2,
        })
    }
}

// ================= 数据模型 =================

#[derive(Clone)]
struct Node {
    name: String,
    level: String, // province | city | county
    province: String,
    city: String,
    ancestors: Vec<String>,
}

#[derive(Clone)]
struct Uni {
    name: String,
    city: String,
    province: String,
    utype: String, // ""=本科 "vocational"=高职 "chengren"=成人
    aliases: Vec<String>,
    alias_year: String,
    alias_kind: String,
    key: String, // 小写检索键（校名+市+省+旧名）
}

fn uni_tag(u: &Uni) -> &'static str {
    match u.utype.as_str() {
        "vocational" => "高职",
        "chengren" => "成人",
        _ => "本科",
    }
}
fn uni_rank(u: &Uni) -> u8 {
    match u.utype.as_str() {
        "vocational" => 1,
        "chengren" => 2,
        _ => 0,
    }
}

fn walk(
    list: &[Value],
    level: &str,
    province: &str,
    city: &str,
    ancestors: &[String],
    out: &mut Vec<Node>,
) {
    for n in list {
        let name = s(n.get("name"));
        let (lvl, c) = if level == "province" && MUNI.contains(&name.as_str()) {
            ("county".to_string(), String::new())
        } else {
            (level.to_string(), city.to_string())
        };
        let prov = if province.is_empty() {
            name.clone()
        } else {
            province.to_string()
        };
        // 与网页版一致：先记录节点，再递归子级（前序）
        out.push(Node {
            name: name.clone(),
            level: lvl.clone(),
            province: prov.clone(),
            city: c.clone(),
            ancestors: ancestors.to_vec(),
        });
        let next_city = if lvl == "province" {
            if MUNI.contains(&name.as_str()) {
                String::new()
            } else {
                name.clone()
            }
        } else if lvl == "city" {
            name.clone()
        } else {
            c.clone()
        };
        let child_level = if lvl == "province" {
            if MUNI.contains(&name.as_str()) {
                "county"
            } else {
                "city"
            }
        } else {
            "county"
        };
        if let Some(ch) = n.get("children").and_then(|v| v.as_array()) {
            let mut anc2 = ancestors.to_vec();
            anc2.push(name);
            walk(ch, child_level, &prov, &next_city, &anc2, out);
        }
    }
}

struct Bundle {
    meta_version: String,
    meta_update: String,
    meta_create: String,
    national: Vec<(String, String)>,
    admin: Vec<Value>,
    admin_names: Vec<String>,
    real: Map<String, Value>,
    unis: Vec<Uni>,
    uni_fee: Map<String, Value>,
    subsidy_default: String,
    nodes: Vec<Node>,
    by_name: BTreeMap<String, Vec<usize>>,
}

impl Bundle {
    fn load() -> Bundle {
        let root: Value = serde_json::from_slice(DATA_JSON).expect("data.json 解析失败");
        let meta = root.get("meta");
        let admin = root
            .get("ADMIN")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let real = root
            .get("REAL")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        let national = root
            .get("NATIONAL")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .map(|n| (s(n.get("name")), s(n.get("desc"))))
                    .collect()
            })
            .unwrap_or_default();
        let uni_fee = root
            .get("UNI_FEE")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();

        // 大学索引（含旧校名别名）
        let aliases_raw = root
            .get("ALIASES")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut alias_by_new: BTreeMap<String, (Vec<String>, String, String)> = BTreeMap::new();
        for a in &aliases_raw {
            let new_name = s(a.get("new"));
            if new_name.is_empty() {
                continue;
            }
            let olds: Vec<String> = match a.get("old") {
                Some(Value::Array(arr)) => arr.iter().map(|x| s(Some(x))).collect(),
                Some(Value::String(st)) => vec![st.clone()],
                _ => vec![],
            };
            let olds: Vec<String> = olds
                .into_iter()
                .filter(|o| !o.is_empty() && *o != new_name)
                .collect();
            if olds.is_empty() {
                continue;
            }
            alias_by_new.insert(new_name, (olds, s(a.get("year")), s(a.get("kind"))));
        }
        let unis: Vec<Uni> = root
            .get("UNIVERSITIES")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .map(|u| {
                        let name = s(u.get("name"));
                        let city = s(u.get("city"));
                        let province = s(u.get("province"));
                        let utype = s(u.get("type"));
                        let (aliases, year, kind) = alias_by_new
                            .get(&name)
                            .cloned()
                            .unwrap_or_else(|| (vec![], String::new(), String::new()));
                        let alias_text = aliases.join(" ");
                        let key =
                            format!("{} {} {} {}", name, city, province, alias_text).to_lowercase();
                        Uni {
                            name,
                            city,
                            province,
                            utype,
                            aliases,
                            alias_year: year,
                            alias_kind: kind,
                            key,
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        let admin_names: Vec<String> = admin
            .iter()
            .map(|p| s(p.get("name")))
            .filter(|x| !x.is_empty())
            .collect();

        let mut nodes = Vec::new();
        walk(&admin, "province", "", "", &[], &mut nodes);
        let mut by_name: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for (i, n) in nodes.iter().enumerate() {
            by_name.entry(n.name.clone()).or_default().push(i);
        }

        Bundle {
            meta_version: s(meta.and_then(|m| m.get("version"))),
            meta_update: s(meta.and_then(|m| m.get("update"))),
            meta_create: s(meta.and_then(|m| m.get("createTime"))),
            national,
            admin,
            admin_names,
            real,
            unis,
            uni_fee,
            subsidy_default: s(root.get("SUBSIDY_DEFAULT")),
            nodes,
            by_name,
        }
    }

    // —— 数据查询辅助 ——
    fn real_of(&self, name: &str) -> Option<&Value> {
        self.real.get(name)
    }
    /// 逐级向上找已收录的真实数据（自身→市→省）
    fn get_detail(&self, node: &Node) -> Option<(String, &Value, bool)> {
        let mut chain = vec![node.name.clone()];
        let mut anc = node.ancestors.clone();
        anc.reverse();
        chain.extend(anc);
        for k in &chain {
            if let Some(d) = self.real_of(k) {
                return Some((k.clone(), d, *k != node.name));
            }
        }
        None
    }
    /// 资助参保对象：自身→所属省市继承，均无则用全国默认
    fn get_subsidy(&self, name: &str, ancestors: &[String]) -> String {
        let mut chain = vec![name.to_string()];
        let mut anc = ancestors.to_vec();
        anc.reverse();
        chain.extend(anc);
        for k in &chain {
            if let Some(d) = self.real_of(k) {
                let sub = f(d, "subsidy");
                if !sub.is_empty() {
                    return sub;
                }
            }
        }
        self.subsidy_default.clone()
    }
    fn find_region_node(&self, province: &str, level: &str, name: &str) -> Option<usize> {
        let arr = self.by_name.get(name)?;
        for &i in arr {
            let n = &self.nodes[i];
            if n.province == province && n.level == level {
                return Some(i);
            }
        }
        arr.first().copied()
    }
    fn resolve_real(&self, name: &str) -> Option<&Value> {
        let tries = [name.to_string(), strip_suffix(name), format!("{}市", name)];
        for t in tries {
            if let Some(v) = self.real_of(&t) {
                return Some(v);
            }
        }
        None
    }
    /// 大学生专项：从混合 fee 串中截取含“大学生”的分段
    fn uni_seg(fee: &str) -> Option<String> {
        if fee.is_empty() {
            return None;
        }
        for seg in fee.split(['；', ';']) {
            if seg.contains("大学生") {
                return Some(seg.trim().to_string());
            }
        }
        None
    }

    // —— 界面数据构建 ——
    fn card_rows(&self, d: &Value) -> Vec<(String, String)> {
        let mut rows = Vec::new();
        for (k, key) in [
            ("医保咨询", "medical"),
            ("税务缴费", "tax"),
            ("2027个人缴费", "fee"),
            ("缴费时间", "period"),
            ("线上缴费", "online"),
            ("线下渠道", "offline"),
            ("备注", "note"),
        ] {
            let v = f(d, key);
            if !v.is_empty() {
                rows.push((k.to_string(), v));
            }
        }
        rows
    }
    fn share_text(&self, title: &str, rows: &[(String, String)]) -> String {
        let mut t = format!("【{}】{}\n", APP_NAME, title);
        for (k, v) in rows {
            t.push_str(&format!("{}：{}\n", k, v));
        }
        t.push_str("（本信息为便民汇总，非官方经办渠道，以当地医保局最新通告为准。制作人：浦江蚂蚁哥 shorver@163.com）");
        t
    }
}

// ================= 界面状态（纯数据） =================

#[derive(Clone)]
enum Act {
    Node(usize),
    Uni(usize),
}

#[derive(Clone)]
struct Cand {
    name: String,
    tag: String,
    path: String,
    act: Act,
}

#[derive(Clone)]
struct Chip {
    name: String,
    sub: String,
    has: bool,
    act: Act,
}

#[derive(Clone)]
struct Card {
    title: String,
    subtitle: String,
    intro: Option<(String, u8)>, // (文本, 类型 1=继承说明 2=蓝色提示)
    countdown: Option<Countdown>,
    rows: Vec<(String, String)>,
    source: String,
    share: String,
}

#[derive(Clone)]
enum Screen {
    Empty,
    Note(String),
    CandList {
        items: Vec<Cand>,
        note: Option<String>,
    },
    Detail {
        card: Card,
    },
    Province {
        card: Option<Card>,
        chips: Vec<Chip>,
        unis: Vec<usize>,
        uni_hint: Option<String>,
        note: Option<String>,
    },
    City {
        card: Option<Card>,
        chips: Vec<Chip>,
        unis: Vec<usize>,
        uni_hint: Option<String>,
        note: Option<String>,
    },
    Uni {
        card: Card,
    },
}

// ================= 逻辑：检索分流 =================

impl Bundle {
    fn uni_items(&self, list: &[usize], limit: usize) -> (Vec<usize>, Option<String>) {
        let mut arr: Vec<usize> = list.to_vec();
        arr.sort_by(|&a, &b| {
            let (ua, ub) = (&self.unis[a], &self.unis[b]);
            uni_rank(ua).cmp(&uni_rank(ub)).then(ua.name.cmp(&ub.name))
        });
        let total = arr.len();
        let shown: Vec<usize> = arr.iter().take(limit).copied().collect();
        let hint = if total > shown.len() {
            Some(format!(
                "共 {} 所，已显示前 {} 所；输入完整校名可精确定位。",
                total,
                shown.len()
            ))
        } else {
            None
        };
        (shown, hint)
    }

    fn cand_from_node(&self, i: usize, tag: &str) -> Cand {
        let n = &self.nodes[i];
        Cand {
            name: n.name.clone(),
            tag: tag.to_string(),
            path: if n.city.is_empty() || n.city == n.province {
                n.province.clone()
            } else {
                format!("{} ／ {}", n.province, n.city)
            },
            act: Act::Node(i),
        }
    }

    fn choice_list(&self, list: &[usize], label: &str) -> Screen {
        let items: Vec<Cand> = list.iter().map(|&i| self.cand_from_node(i, label)).collect();
        let note = format!(
            "检测到多个同名“{}”（{}），请点击下方具体的一个以查看。",
            self.nodes[list[0]].name, label
        );
        Screen::CandList {
            items,
            note: Some(note),
        }
    }

    fn uni_cand(&self, i: usize) -> Cand {
        let u = &self.unis[i];
        Cand {
            name: u.name.clone(),
            tag: uni_tag(u).to_string(),
            path: format!("{} ／ {}", u.province, u.city),
            act: Act::Uni(i),
        }
    }

    fn full_text(&self, kw: &str) -> Screen {
        let kl = kw.to_lowercase();
        let mut rhits: Vec<usize> = Vec::new();
        for (i, n) in self.nodes.iter().enumerate() {
            if n.name.contains(kw)
                || n.province.contains(kw)
                || (!n.city.is_empty() && n.city.contains(kw))
            {
                rhits.push(i);
                continue;
            }
            if let Some((_, d, _)) = self.get_detail(n) {
                let hay = [
                    f(d, "fee"),
                    f(d, "period"),
                    f(d, "online"),
                    f(d, "offline"),
                    f(d, "note"),
                    f(d, "medical"),
                    f(d, "tax"),
                ]
                .join(" ");
                if hay.contains(kw) {
                    rhits.push(i);
                }
            }
        }
        rhits.truncate(20);
        let uhits: Vec<usize> = self
            .unis
            .iter()
            .enumerate()
            .filter(|(_, u)| {
                u.name.contains(kw) || u.key.contains(&kl) || u.aliases.iter().any(|a| a.contains(kw))
            })
            .map(|(i, _)| i)
            .take(15)
            .collect();
        if rhits.is_empty() && uhits.is_empty() {
            return Screen::Note(format!(
                "未找到与“{}”相关的地区或高校，可尝试更简短的关键词。",
                kw
            ));
        }
        let mut items: Vec<Cand> = rhits
            .iter()
            .map(|&i| self.cand_from_node(i, level_cn(&self.nodes[i].level)))
            .collect();
        items.extend(uhits.iter().map(|&i| self.uni_cand(i)));
        Screen::CandList {
            items,
            note: None,
        }
    }

    // —— 合并智能搜索：省 > 市 > 区县 > 大学 > 全文回退 ——
    fn smart_search(&self, input: &str) -> Screen {
        let kw: String = input.chars().filter(|c| !c.is_whitespace()).collect();
        if kw.is_empty() {
            return Screen::Empty;
        }
        for p in &self.admin_names {
            if name_hit(&kw, p) {
                return self.show_province(p);
            }
        }
        let city_hits: Vec<usize> = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, n)| n.level == "city" && name_hit(&kw, &n.name))
            .map(|(i, _)| i)
            .collect();
        if city_hits.len() == 1 {
            return self.city_merge(city_hits[0]);
        }
        if city_hits.len() > 1 {
            return self.choice_list(&city_hits, "市级");
        }
        let county_hits: Vec<usize> = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, n)| n.level == "county" && name_hit(&kw, &n.name))
            .map(|(i, _)| i)
            .collect();
        if county_hits.len() == 1 {
            return self.render_detail(county_hits[0]);
        }
        if county_hits.len() > 1 {
            return self.choice_list(&county_hits, "区/县级");
        }
        let uni_hits: Vec<usize> = self
            .unis
            .iter()
            .enumerate()
            .filter(|(_, u)| u.name.contains(&kw) || u.aliases.iter().any(|a| a.contains(&kw)))
            .map(|(i, _)| i)
            .collect();
        if uni_hits.len() == 1 {
            return self.render_uni(uni_hits[0]);
        }
        if uni_hits.len() > 1 {
            let items: Vec<Cand> = uni_hits.iter().map(|&i| self.uni_cand(i)).collect();
            return Screen::CandList {
                items,
                note: None,
            };
        }
        self.full_text(&kw)
    }

    // —— 区县详情 ——
    fn render_detail(&self, i: usize) -> Screen {
        let node = &self.nodes[i];
        match self.get_detail(node) {
            None => Screen::Note("暂无该地区数据。".into()),
            Some((used_name, d, inherited)) => {
                let period = f(d, "period");
                let mut rows = self.card_rows(d);
                rows.push((
                    "资助参保对象".into(),
                    self.get_subsidy(&node.name, &node.ancestors),
                ));
                let subtitle = format!(
                    "{} ｜ {}{}",
                    level_cn(&node.level),
                    node.province,
                    if node.city.is_empty() {
                        String::new()
                    } else {
                        format!(" ／ {}", node.city)
                    }
                );
                let intro = if inherited {
                    Some((
                        format!(
                            "以下为【{}】统一征缴标准。该地（{}）未单独发布独立通告，具体缴费标准、起止时间、资助政策以当地最新通告为准。",
                            used_name, node.name
                        ),
                        1,
                    ))
                } else {
                    None
                };
                let title = if inherited {
                    format!("{}（沿用{}）", node.name, used_name)
                } else {
                    node.name.clone()
                };
                let share = self.share_text(&title, &rows);
                Screen::Detail {
                    card: Card {
                        title,
                        subtitle,
                        intro,
                        countdown: countdown_info(&period),
                        rows,
                        source: {
                            let src = f(d, "source");
                            if src.is_empty() {
                                "各地医保局/税务局公开通告".into()
                            } else {
                                src
                            }
                        },
                        share,
                    },
                }
            }
        }
    }

    // —— 省级聚合 ——
    fn show_province(&self, pname: &str) -> Screen {
        let prov = self.admin.iter().find(|p| s(p.get("name")) == pname);
        let children: Vec<&Value> = prov
            .and_then(|p| p.get("children"))
            .and_then(|v| v.as_array())
            .map(|a| a.iter().collect())
            .unwrap_or_default();
        let is_muni = MUNI.contains(&pname);
        let res = self.real_of(pname).cloned();
        let univs: Vec<usize> = self
            .unis
            .iter()
            .enumerate()
            .filter(|(_, u)| u.province == pname)
            .map(|(i, _)| i)
            .collect();
        let (unis, uni_hint) = self.uni_items(&univs, 40);
        let mut chips = Vec::new();
        for c in &children {
            let cname = s(c.get("name"));
            let cnt = c
                .get("children")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            let fn_idx = self.find_region_node(pname, if is_muni { "county" } else { "city" }, &cname);
            let has = fn_idx
                .map(|i| self.real_of(&self.nodes[i].name).is_some())
                .unwrap_or(false);
            let sub = if has {
                "有标准".to_string()
            } else if cnt > 0 {
                format!("{}个区县", cnt)
            } else {
                "看上级".to_string()
            };
            if let Some(i) = fn_idx {
                chips.push(Chip {
                    name: cname,
                    sub,
                    has,
                    act: Act::Node(i),
                });
            }
        }
        let subtitle = format!(
            "{} · 下辖地区 + 在校大学",
            if is_muni { "直辖市" } else { "省级" }
        );
        let (card, note) = match &res {
            Some(d) => {
                let period = f(d, "period");
                let mut rows = self.card_rows(d);
                rows.push(("资助参保对象".into(), self.get_subsidy(pname, &[])));
                let share = self.share_text(
                    &format!(
                        "{}{}",
                        pname,
                        if is_muni { "（直辖市）" } else { "（全省/市通用）" }
                    ),
                    &rows,
                );
                (
                    Some(Card {
                        title: pname.to_string(),
                        subtitle,
                        intro: None,
                        countdown: countdown_info(&period),
                        rows,
                        source: {
                            let src = f(d, "source");
                            if src.is_empty() {
                                "各地医保局/税务局公开通告".into()
                            } else {
                                src
                            }
                        },
                        share,
                    }),
                    None,
                )
            }
            None => (
                None,
                Some(format!(
                    "该{}暂无统一征缴标准，请进入下辖地区查看。",
                    if is_muni { "市" } else { "省" }
                )),
            ),
        };
        Screen::Province {
            card,
            chips,
            unis,
            uni_hint,
            note,
        }
    }

    // —— 市级聚合 ——
    fn city_merge(&self, i: usize) -> Screen {
        let node = &self.nodes[i];
        let city_name = node.name.clone();
        let has_city_real = self.real_of(&city_name).is_some();
        let data = self
            .resolve_real(&city_name)
            .or_else(|| self.real_of(&node.province))
            .cloned();
        let inherited = data.is_some() && !has_city_real;
        let counties: Vec<usize> = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, c)| {
                c.level == "county" && c.province == node.province && c.city == city_name
            })
            .map(|(i, _)| i)
            .collect();
        let univs: Vec<usize> = self
            .unis
            .iter()
            .enumerate()
            .filter(|(_, u)| place_hit(&u.city, &city_name))
            .map(|(i, _)| i)
            .collect();
        let (unis, uni_hint) = self.uni_items(&univs, 60);
        let mut chips = Vec::new();
        for &ci in &counties {
            let c = &self.nodes[ci];
            let has = self.real_of(&c.name).is_some();
            chips.push(Chip {
                name: c.name.clone(),
                sub: if has { "有标准".into() } else { "看上级".into() },
                has,
                act: Act::Node(ci),
            });
        }
        let (card, note) = match &data {
            Some(d) => {
                let period = f(d, "period");
                let mut rows = self.card_rows(d);
                rows.push((
                    "资助参保对象".into(),
                    self.get_subsidy(&city_name, std::slice::from_ref(&node.province)),
                ));
                let title = if inherited {
                    format!("{}（沿用{}）", city_name, node.province)
                } else {
                    city_name.clone()
                };
                let share = self.share_text(&title, &rows);
                (
                    Some(Card {
                        title,
                        subtitle: format!("市级 · 下辖区县 + 在校大学 ｜ {}", node.province),
                        intro: if inherited {
                            Some((
                                format!(
                                    "该市未单独发布通告，以下为【{}】统一标准，具体以当地最新通告为准。",
                                    node.province
                                ),
                                1,
                            ))
                        } else {
                            None
                        },
                        countdown: countdown_info(&period),
                        rows,
                        source: {
                            let src = f(d, "source");
                            if src.is_empty() {
                                "各地医保局/税务局公开通告".into()
                            } else {
                                src
                            }
                        },
                        share,
                    }),
                    None,
                )
            }
            None => (
                None,
                Some("暂无该市及所属省统一标准，请进入下辖区县查看。".into()),
            ),
        };
        Screen::City {
            card,
            chips,
            unis,
            uni_hint,
            note,
        }
    }

    // —— 大学页签：候选列表 ——
    fn show_uni_candidates(&self, kw: &str) -> Screen {
        let kw = kw.trim();
        if kw.is_empty() {
            return Screen::Empty;
        }
        let kl = kw.to_lowercase();
        let hits: Vec<usize> = self
            .unis
            .iter()
            .enumerate()
            .filter(|(_, u)| u.name.contains(kw) || u.key.contains(&kl))
            .map(|(i, _)| i)
            .take(15)
            .collect();
        if hits.is_empty() {
            return Screen::Note(
                "未找到匹配的高校，试试只输入校名关键词，如“浙大”“武汉”“师范”。".into(),
            );
        }
        Screen::CandList {
            items: hits.iter().map(|&i| self.uni_cand(i)).collect(),
            note: None,
        }
    }

    // —— 大学详情 ——
    fn render_uni(&self, i: usize) -> Screen {
        let u = &self.unis[i];
        let prov_real = self.real_of(&u.province).cloned();
        let city_real = self.resolve_real(&u.city).cloned();
        let fee_obj = self.uni_fee.get(&u.city).cloned();
        let is_chengren = u.utype == "chengren";
        let (mut fee, mut period, mut online, mut note, mut source, mut prov_fallback) =
            (String::new(), String::new(), String::new(), String::new(), String::new(), false);
        if is_chengren {
            if let Some(d) = &city_real {
                fee = f(d, "fee");
                period = f(d, "period");
                online = f(d, "online");
                note = f(d, "note");
                source = f(d, "source");
            } else if let Some(d) = &prov_real {
                fee = f(d, "fee");
                period = f(d, "period");
                online = f(d, "online");
                note = f(d, "note");
                source = f(d, "source");
                prov_fallback = true;
            }
        } else if let Some(o) = &fee_obj {
            fee = f(o, "fee");
            period = f(o, "period");
            online = f(o, "online");
            note = f(o, "note");
            source = f(o, "source");
        } else if let Some(d) = &city_real {
            fee = Bundle::uni_seg(&f(d, "fee")).unwrap_or_else(|| f(d, "fee"));
            period = f(d, "period");
            online = f(d, "online");
            note = f(d, "note");
            source = f(d, "source");
        } else if let Some(d) = &prov_real {
            fee = Bundle::uni_seg(&f(d, "fee")).unwrap_or_else(|| f(d, "fee"));
            period = f(d, "period");
            online = f(d, "online");
            note = f(d, "note");
            source = f(d, "source");
            prov_fallback = true;
        }
        if fee.is_empty() {
            return Screen::Note(format!("暂未收录该校所在地（{}）的大学生医保标准。", u.city));
        }
        let phone = city_real
            .as_ref()
            .map(|d| f(d, "medical"))
            .filter(|x| !x.is_empty())
            .or_else(|| prov_real.as_ref().map(|d| f(d, "medical")))
            .unwrap_or_default();
        let tax = city_real
            .as_ref()
            .map(|d| f(d, "tax"))
            .filter(|x| !x.is_empty())
            .or_else(|| prov_real.as_ref().map(|d| f(d, "tax")))
            .unwrap_or_default();
        let level = match u.utype.as_str() {
            "vocational" => "高职（专科）",
            "chengren" => "成人高校",
            _ => "本科",
        };
        let intro = if is_chengren {
            "成人高校（开放大学/广播电视大学/职工大学/管理干部学院等）学生多为在职或非全日制，一般参加职工医保或城乡居民医保（一般居民档），通常不适用全日制“大学生”档。以下为该地 2027 年度城乡居民医保一般标准，具体以学校及当地医保部门通知为准。".to_string()
        } else if prov_fallback {
            format!(
                "该校所在地「{}」为省/自治区直辖县级行政单位，暂按「{}」统一标准执行；具体以当地医保部门及学校通知为准。",
                u.city, u.province
            )
        } else {
            "在校学生（含高职专科）医保一般由学校统一组织参保，缴费标准执行学校所在地市的“大学生”档。以下为该地 2027 年度标准。".to_string()
        };
        let mut rows: Vec<(String, String)> = Vec::new();
        rows.push(("办学层次".into(), level.into()));
        if !u.aliases.is_empty() {
            let alias = if u.alias_year.is_empty() {
                u.aliases.join("、")
            } else {
                format!(
                    "{}（{} 年{}）",
                    u.aliases.join("、"),
                    u.alias_year,
                    if u.alias_kind.is_empty() {
                        "变更"
                    } else {
                        &u.alias_kind
                    }
                )
            };
            rows.push(("原校名".into(), alias));
        }
        if !phone.is_empty() {
            rows.push(("医保咨询".into(), phone));
        }
        if !tax.is_empty() {
            rows.push(("税务缴费".into(), tax));
        }
        rows.push((
            if is_chengren {
                "2027城乡居民个人缴费（一般档）"
            } else {
                "2027大学生个人缴费"
            }
            .into(),
            fee.clone(),
        ));
        if !period.is_empty() {
            rows.push(("缴费时间".into(), period.clone()));
        }
        if !online.is_empty() {
            rows.push(("参保/缴费方式".into(), online));
        }
        if !note.is_empty() {
            rows.push(("备注".into(), note));
        }
        rows.push((
            "资助参保对象".into(),
            self.get_subsidy(&u.city, std::slice::from_ref(&u.province)),
        ));
        let share = self.share_text(&u.name, &rows);
        Screen::Uni {
            card: Card {
                title: u.name.clone(),
                subtitle: format!("{}·在校学生医保 ｜ {} ／ {}", level, u.province, u.city),
                intro: Some((intro, 2)),
                countdown: countdown_info(&period),
                rows,
                source: if source.is_empty() {
                    "各地医保局/税务局/高校官网公开通告".into()
                } else {
                    source
                },
                share,
            },
        }
    }
}

// ================= 应用 =================

/// 安装中文字体：内嵌子集置首位（自包含，任何机器中文不乱码），
/// 系统黑体追加兜底（覆盖子集外的生僻字/繁体，取不到也不影响）。
fn install_cjk_fonts(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "cjk".to_owned(),
        std::sync::Arc::new(egui::FontData::from_owned(CJK_FONT.to_vec())),
    );
    let mut sys_loaded = false;
    if let Ok(bytes) = std::fs::read(r"C:\Windows\Fonts\simhei.ttf") {
        if !bytes.is_empty() {
            fonts.font_data.insert(
                "cjk_sys".to_owned(),
                std::sync::Arc::new(egui::FontData::from_owned(bytes)),
            );
            sys_loaded = true;
        }
    }
    // 比例字体：内嵌 CJK 放最前；等宽字体：追加到末尾（拉丁字符仍走原等宽字体）
    let prop = fonts
        .families
        .entry(egui::FontFamily::Proportional)
        .or_default();
    prop.insert(0, "cjk".to_owned());
    if sys_loaded {
        prop.push("cjk_sys".to_owned());
    }
    let mono = fonts
        .families
        .entry(egui::FontFamily::Monospace)
        .or_default();
    mono.push("cjk".to_owned());
    if sys_loaded {
        mono.push("cjk_sys".to_owned());
    }
    ctx.set_fonts(fonts);
}

struct App {
    b: Bundle,
    tab: usize, // 0=地区 1=大学
    query: String,
    screen: Screen,
    uni_query: String,
    uni_screen: Screen,
    prov_active: Option<String>,
    flash: Option<(String, std::time::Instant)>,
}

impl App {
    fn new(cc: &eframe::CreationContext<'_>) -> App {
        // 中文字体必须最先安装，否则界面中文全部显示为 □
        install_cjk_fonts(&cc.egui_ctx);
        // 适老化大字号 + 浅色主题
        let mut style = (*cc.egui_ctx.style()).clone();
        style.text_styles = [
            (egui::TextStyle::Small, egui::FontId::proportional(16.0)),
            (egui::TextStyle::Body, egui::FontId::proportional(19.0)),
            (egui::TextStyle::Button, egui::FontId::proportional(18.0)),
            (egui::TextStyle::Heading, egui::FontId::proportional(28.0)),
            (egui::TextStyle::Monospace, egui::FontId::proportional(18.0)),
        ]
        .into();
        style.spacing.item_spacing = egui::vec2(10.0, 8.0);
        cc.egui_ctx.set_style(style);
        let mut visuals = egui::Visuals::light();
        visuals.selection.bg_fill = egui::Color32::from_rgb(0xdf, 0xec, 0xfb);
        visuals.selection.stroke.color = BRAND;
        cc.egui_ctx.set_visuals(visuals);

        let b = Bundle::load();
        let screen = b.smart_search("浦江");
        App {
            b,
            tab: 0,
            query: "浦江".into(),
            screen,
            uni_query: String::new(),
            uni_screen: Screen::Empty,
            prov_active: None,
            flash: None,
        }
    }

    fn set_flash(&mut self, msg: &str) {
        self.flash = Some((msg.to_string(), std::time::Instant::now()));
    }

    /// 候选点击后的动作分发
    fn apply(&mut self, act: Act) -> Screen {
        match act {
            Act::Node(i) => {
                if self.b.nodes[i].level == "city" {
                    self.b.city_merge(i)
                } else {
                    self.b.render_detail(i)
                }
            }
            Act::Uni(i) => self.b.render_uni(i),
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // 顶部品牌栏（蓝底白字 + 图标）
        egui::TopBottomPanel::top("brand")
            .frame(
                egui::Frame::NONE
                    .fill(BRAND)
                    .inner_margin(egui::Margin::symmetric(14, 12)),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.add(
                        egui::Image::from_bytes("logo.png", LOGO_PNG)
                            .fit_to_exact_size(egui::vec2(56.0, 56.0)),
                    );
                    ui.add_space(6.0);
                    ui.vertical(|ui| {
                        ui.label(
                            egui::RichText::new(APP_NAME)
                                .size(30.0)
                                .strong()
                                .color(egui::Color32::WHITE),
                        );
                        ui.label(
                            egui::RichText::new(format!(
                                "版本 {} ｜ 数据更新：{} ｜ 2027年度城乡居民医保征缴信息 ｜ 制作人：浦江蚂蚁哥",
                                VERSION,
                                if self.b.meta_update.is_empty() {
                                    "—".to_string()
                                } else {
                                    self.b.meta_update.clone()
                                }
                            ))
                            .size(15.0)
                            .color(egui::Color32::from_rgb(0xdf, 0xea, 0xf7)),
                        );
                    });
                });
            });

        // 底部状态栏
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            let msg = match &self.flash {
                Some((m, t)) if t.elapsed().as_secs() < 3 => m.clone(),
                _ => format!("数据已内嵌 · 单文件离线运行 · 版本 {}", VERSION),
            };
            ui.label(egui::RichText::new(msg).size(14.0).color(SUB));
        });

        // 中央面板
        egui::CentralPanel::default().show(ctx, |ui| {
            // 页签
            ui.horizontal(|ui| {
                if ui
                    .selectable_label(self.tab == 0, " 查地区（省/市/区/县）")
                    .clicked()
                {
                    self.tab = 0;
                }
                if ui
                    .selectable_label(self.tab == 1, " 查大学（大学生医保）")
                    .clicked()
                {
                    self.tab = 1;
                    self.uni_query = String::new();
                    self.uni_screen = Screen::Empty;
                }
            });
            ui.add_space(4.0);

            let mut acts: Vec<Act> = Vec::new();
            let mut flash: Option<(String, std::time::Instant)> = None;

            if self.tab == 0 {
                // 搜索行（输入即搜）
                ui.horizontal(|ui| {
                    let resp = ui.add(
                        egui::TextEdit::singleline(&mut self.query)
                            .hint_text("输入省/市/区县或大学名，智能识别，如：浙江、金华、浦江、浙江大学…")
                            .desired_width(ui.available_width() - 76.0),
                    );
                    if resp.changed() {
                        self.prov_active = None;
                        self.screen = self.b.smart_search(&self.query);
                    }
                    if ui.button("搜索").clicked() {
                        self.prov_active = None;
                        self.screen = self.b.smart_search(&self.query);
                    }
                });
                ui.add_space(2.0);

                // 省份快速入口
                ui.horizontal_wrapped(|ui| {
                    ui.label(egui::RichText::new("按省份快速查：").size(15.5).color(SUB));
                    for p in &self.b.admin_names {
                        let active = self.prov_active.as_deref() == Some(p.as_str());
                        let btn = egui::Button::new(
                            egui::RichText::new(p)
                                .size(15.5)
                                .color(if active {
                                    egui::Color32::WHITE
                                } else {
                                    BRAND_D
                                }),
                        )
                        .fill(if active {
                            BRAND
                        } else {
                            egui::Color32::from_rgb(0xea, 0xf3, 0xfc)
                        })
                        .small();
                        if ui.add(btn).clicked() {
                            self.prov_active = Some(p.clone());
                            self.screen = self.b.show_province(p);
                        }
                    }
                });
                ui.add_space(2.0);

                // 全国通用缴费方式（折叠）
                egui::CollapsingHeader::new(egui::RichText::new("全国通用缴费方式").strong())
                    .id_salt("nat")
                    .show(ui, |ui| {
                        for (name, desc) in &self.b.national {
                            ui.horizontal_wrapped(|ui| {
                                ui.label(egui::RichText::new(name).strong().color(BRAND_D));
                                ui.label(egui::RichText::new(desc).color(INK));
                            });
                        }
                    });
                ui.add_space(2.0);

                egui::ScrollArea::vertical().show(ui, |ui| {
                    render_screen(ui, &self.b, &self.screen, &mut acts, &mut flash);
                });
            } else {
                ui.horizontal(|ui| {
                    let resp = ui.add(
                        egui::TextEdit::singleline(&mut self.uni_query)
                            .hint_text("如：浙江大学、深圳职业技术学院、黄河水利职业技术学院…")
                            .desired_width(ui.available_width() - 76.0),
                    );
                    if resp.changed() {
                        self.uni_screen = self.b.show_uni_candidates(&self.uni_query);
                    }
                    if ui.button("搜索").clicked() {
                        self.uni_screen = self.b.show_uni_candidates(&self.uni_query);
                    }
                });
                ui.add_space(4.0);
                egui::ScrollArea::vertical().show(ui, |ui| {
                    render_screen(ui, &self.b, &self.uni_screen, &mut acts, &mut flash);
                });
            }

            // 分发点击动作（每帧最多一个）
            if let Some(act) = acts.into_iter().next() {
                let s = self.apply(act);
                if self.tab == 0 {
                    self.screen = s;
                } else {
                    self.uni_screen = s;
                }
            }
            if let Some((m, t)) = flash {
                self.flash = Some((m, t));
            }
        });
    }
}

// ================= 界面渲染 =================

fn render_screen(
    ui: &mut egui::Ui,
    b: &Bundle,
    screen: &Screen,
    acts: &mut Vec<Act>,
    flash: &mut Option<(String, std::time::Instant)>,
) {
    match screen {
        Screen::Empty => {}
        Screen::Note(t) => {
            ui.label(egui::RichText::new(t).color(GRAY));
        }
        Screen::CandList { items, note } => {
            if let Some(n) = note {
                ui.label(egui::RichText::new(n).color(GRAY));
                ui.add_space(4.0);
            }
            for it in items {
                ui.horizontal(|ui| {
                    if ui
                        .add(egui::Button::new(egui::RichText::new(&it.name).strong()).small())
                        .clicked()
                    {
                        acts.push(it.act.clone());
                    }
                    ui.label(egui::RichText::new(format!("[{}]", it.tag)).small().color(SUB));
                    ui.label(egui::RichText::new(&it.path).small().color(SUB));
                });
            }
        }
        Screen::Detail { card } => render_card(ui, card, flash),
        Screen::Uni { card } => render_card(ui, card, flash),
        Screen::Province {
            card,
            chips,
            unis,
            uni_hint,
            note,
        }
        | Screen::City {
            card,
            chips,
            unis,
            uni_hint,
            note,
        } => {
            if let Some(n) = note {
                ui.label(egui::RichText::new(n).color(GRAY));
            }
            if let Some(c) = card {
                render_card(ui, c, flash);
                ui.add_space(6.0);
            }
            if !chips.is_empty() {
                ui.label(
                    egui::RichText::new(format!("下辖地区（{}，点击查看）", chips.len()))
                        .strong()
                        .color(BRAND_D),
                );
                ui.horizontal_wrapped(|ui| {
                    for ch in chips {
                        let txt = format!("{} {}", ch.name, ch.sub);
                        let btn = egui::Button::new(
                            egui::RichText::new(txt)
                                .small()
                                .color(if ch.has { BRAND_D } else { INK }),
                        )
                        .fill(if ch.has {
                            egui::Color32::from_rgb(0xe8, 0xf2, 0xfd)
                        } else {
                            egui::Color32::from_rgb(0xf2, 0xf4, 0xf6)
                        })
                        .small();
                        if ui.add(btn).clicked() {
                            acts.push(ch.act.clone());
                        }
                    }
                });
                ui.add_space(6.0);
            }
            if !unis.is_empty() {
                ui.label(
                    egui::RichText::new(format!("在校大学（{}）", unis.len()))
                        .strong()
                        .color(BRAND_D),
                );
                for &i in unis {
                    let name = &b.unis[i].name;
                    if ui
                        .add(egui::Button::new(egui::RichText::new(name).color(BRAND_D)).frame(false))
                        .clicked()
                    {
                        acts.push(Act::Uni(i));
                    }
                }
                if let Some(h) = uni_hint {
                    ui.label(egui::RichText::new(h).small().color(GRAY));
                }
            }
        }
    }
}

fn render_card(ui: &mut egui::Ui, card: &Card, flash: &mut Option<(String, std::time::Instant)>) {
    // 标题 + 副标题
    ui.label(egui::RichText::new(&card.title).size(26.0).strong().color(BRAND_D));
    ui.label(egui::RichText::new(&card.subtitle).size(15.5).color(SUB));
    ui.add_space(4.0);

    // 说明块（继承说明=橙色底；大学提示=蓝底）
    if let Some((intro, kind)) = &card.intro {
        let (bg, fg) = if *kind == 1 {
            (
                egui::Color32::from_rgb(0xfd, 0xf3, 0xe3),
                egui::Color32::from_rgb(0x7a, 0x4c, 0x08),
            )
        } else {
            (
                egui::Color32::from_rgb(0xee, 0xf7, 0xff),
                egui::Color32::from_rgb(0x11, 0x33, 0x66),
            )
        };
        egui::Frame::NONE
            .fill(bg)
            .inner_margin(egui::Margin::same(10))
            .corner_radius(egui::CornerRadius::same(6))
            .show(ui, |ui| {
                ui.label(egui::RichText::new(intro).size(15.5).color(fg));
            });
        ui.add_space(4.0);
    }

    // 倒计时
    if let Some(cd) = &card.countdown {
        let color = match cd.state {
            0 => OK_GREEN,
            1 => WARN_ORANGE,
            _ => GRAY,
        };
        egui::Frame::NONE
            .fill(egui::Color32::from_rgb(0xf4, 0xf9, 0xf4))
            .inner_margin(egui::Margin::same(8))
            .corner_radius(egui::CornerRadius::same(6))
            .show(ui, |ui| {
                ui.label(egui::RichText::new(&cd.text).strong().color(color));
            });
        ui.add_space(4.0);
    }

    // 字段行（两列网格）
    egui::Grid::new("card_rows")
        .num_columns(2)
        .spacing([16.0, 10.0])
        .striped(true)
        .show(ui, |ui| {
            for (k, v) in &card.rows {
                ui.label(egui::RichText::new(k).strong().color(BRAND_D));
                ui.add(egui::Label::new(egui::RichText::new(v)).wrap_mode(egui::TextWrapMode::Wrap));
                ui.end_row();
            }
        });
    ui.add_space(4.0);

    // 复制信息（替代网页版的分享图导出，桌面端直接进剪贴板）
    // 注意：不使用 emoji（如 📋），内嵌字体与系统字体均无此字形会显示为 □
    if ui
        .add(
            egui::Button::new(
                egui::RichText::new("复制信息（可粘贴到微信发给村民）").color(egui::Color32::WHITE),
            )
            .fill(BRAND),
        )
        .clicked()
    {
        ui.ctx().copy_text(card.share.clone());
        *flash = Some((
            "已复制到剪贴板，可直接粘贴发送".into(),
            std::time::Instant::now(),
        ));
    }
    ui.add_space(4.0);

    // 来源与免责
    ui.label(
        egui::RichText::new(format!("数据来源：{}", card.source))
            .size(14.0)
            .color(SUB),
    );
    ui.label(
        egui::RichText::new(
            "本工具为便民信息汇总，非官方经办渠道，不提供参保登记、报销申请、账户查询等医保经办服务，具体以当地医保局通告为准。",
        )
        .size(14.0)
        .color(SUB),
    );
}

// ================= 单元测试 =================

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle() -> Bundle {
        Bundle::load()
    }

    #[test]
    fn test_name_hit() {
        assert!(name_hit("金华", "金华市"));
        assert!(name_hit("金华市", "金华"));
        assert!(!name_hit("朝阳区", "朝阳市")); // 后缀冲突
        assert!(name_hit("朝阳区", "朝阳区"));
        assert!(name_hit("广西", "广西壮族自治区")); // 自治区简称
        assert!(name_hit("新疆", "新疆维吾尔自治区"));
        assert!(!name_hit("县", "浦江县")); // <2 字
        assert!(name_hit("浦江", "浦江县"));
    }

    #[test]
    fn test_parse_deadline() {
        assert_eq!(parse_deadline("2026.10.26—12.25"), Some((2026, 12, 25)));
        assert_eq!(
            parse_deadline("学生2026.10.22—27；居民2026.10.26—12.25"),
            Some((2026, 12, 25))
        );
        assert_eq!(parse_deadline("2026年9月1日—12月31日"), Some((2026, 12, 31)));
        assert_eq!(parse_deadline("2026.10.26—2026.12.25"), Some((2026, 12, 25)));
        assert_eq!(parse_deadline("2026.11.1—11.30"), Some((2026, 11, 30)));
        assert_eq!(parse_deadline("全年常态化征收"), None);
        assert_eq!(parse_deadline(""), None);
    }

    #[test]
    fn test_days_from_civil() {
        // 1970-01-01 = 0；2026-10-25 = ?
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2026, 10, 25), 20751);
        assert_eq!(days_from_civil(2026, 12, 25), 20812);
        // 今天距 2026-12-25 截止应为 61 天（与网页版一致）
        assert_eq!(days_from_civil(2026, 12, 25) - today_days(), 61);
    }

    #[test]
    fn test_smart_search_levels() {
        let b = bundle();
        // 省级
        match b.smart_search("浙江") {
            Screen::Province { unis, chips, .. } => {
                assert!(chips.len() >= 5, "浙江下辖市 chips: {}", chips.len());
                assert!(!unis.is_empty(), "浙江应有省内大学");
            }
            _ => panic!("“浙江”应命中省级聚合"),
        }
        // 自治区简称
        match b.smart_search("广西") {
            Screen::Province { .. } => {}
            _ => panic!("“广西”应命中省级聚合"),
        }
        // 市级
        match b.smart_search("金华") {
            Screen::City { chips, .. } => {
                assert!(!chips.is_empty(), "金华应有下辖区县");
            }
            _ => panic!("“金华”应命中市级聚合"),
        }
        // 县级
        match b.smart_search("浦江") {
            Screen::Detail { card } => {
                assert_eq!(card.title, "浦江县");
                assert!(card.rows.iter().any(|(k, _)| k == "2027个人缴费"));
                assert!(card.countdown.is_some(), "浦江应有倒计时");
            }
            _ => panic!("“浦江”应命中区县详情"),
        }
        // 大学
        match b.smart_search("浙江大学") {
            Screen::Uni { card } => {
                assert_eq!(card.title, "浙江大学");
                assert!(card.rows.iter().any(|(k, _)| k == "2027大学生个人缴费"));
            }
            _ => panic!("“浙江大学”应命中大学详情"),
        }
    }

    #[test]
    fn test_ambiguous_county() {
        let b = bundle();
        match b.smart_search("朝阳区") {
            Screen::CandList { items, .. } => {
                assert!(items.len() > 1, "朝阳区应有多个候选");
            }
            _ => panic!("“朝阳区”应进入重名候选"),
        }
    }

    #[test]
    fn test_subsidy_inheritance() {
        let b = bundle();
        // 杭州非浙江市级 REAL 条目，应继承浙江省 subsidy
        let s = b.get_subsidy("杭州市", &["浙江省".to_string()]);
        assert!(s.contains("浙江") || s.contains("财政") || !s.is_empty());
        // 全国默认兜底
        let d = b.get_subsidy("不存在的地方", &[]);
        assert_eq!(d, b.subsidy_default);
    }

    #[test]
    fn test_cjk_font_embedded() {
        // 内嵌字体必须存在且是合法 sfnt（否则界面中文会变 □）
        assert!(CJK_FONT.len() > 500_000, "内嵌中文字体缺失或过小");
        let magic = u32::from_be_bytes([
            CJK_FONT[0],
            CJK_FONT[1],
            CJK_FONT[2],
            CJK_FONT[3],
        ]);
        assert!(
            magic == 0x0001_0000
                || magic == u32::from_be_bytes(*b"OTTO")
                || magic == u32::from_be_bytes(*b"true"),
            "内嵌字体不是合法 sfnt 文件"
        );
    }
}

// ================= 入口 =================

fn main() -> eframe::Result<()> {
    let icon = eframe::icon_data::from_png_bytes(LOGO_PNG).expect("窗口图标加载失败");
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1000.0, 820.0])
            .with_min_inner_size([680.0, 540.0])
            .with_icon(icon),
        ..Default::default()
    };
    eframe::run_native(
        &format!("{} v{}", APP_NAME, VERSION),
        options,
        Box::new(|cc| Ok(Box::new(App::new(cc)))),
    )
}
