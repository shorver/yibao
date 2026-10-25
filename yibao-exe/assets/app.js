// 2027年度城乡居民医保征缴查询 — 前端逻辑
// 数据优先从 ./data.json 异步加载（支持刷新）；file:// 双击打开时降级到全局 <script> 变量。
(function () {
  'use strict';

  // —— 可变数据（applyData 时赋值）——
  var META, NATIONAL, ADMIN, REAL, UNIVERSITIES, ALIASES, UNI_FEE, SUBSIDY_DEFAULT;
  var nodes = [], byName = {}, uniIdx = [], aliasByNew = {};
  var cityNodes = [], countyNodes = [];
  var currentMode = 'local'; // 'net' = 已联网加载 data.json（可刷新）；'local' = 静态降级
  var MUNI = { '北京市': 1, '天津市': 1, '上海市': 1, '重庆市': 1 };
  var LV = { province: '省/直辖市', city: '地级市', county: '区/县' };

  // —— DOM 引用（元素静态存在，一次性获取）——
  var $meta = document.getElementById('meta');
  var $foot = document.getElementById('footUpdate');
  var $foot2 = document.getElementById('footUpdate2');
  var $footC = document.getElementById('footCreate');
  var $footV = document.getElementById('footVer');
  var $nat = document.getElementById('national');
  var $prov = document.getElementById('provBar');
  var $q = document.getElementById('q');
  var $cand = document.getElementById('cand');
  var $detail = document.getElementById('detail');
  var $uq = document.getElementById('uq');
  var $ucand = document.getElementById('ucand');
  var $udetail = document.getElementById('udetail');
  var $refresh = document.getElementById('refresh');
  var $modeTip = document.getElementById('modeTip');

  var DISCLAIMER = '<div class="disc">本工具为便民信息汇总，非官方经办渠道，不提供参保登记、报销申请、账户查询等医保经办服务，具体以当地医保局通告为准。</div>';

  // ============ 数据加载与索引 ============
  function walk(list, level, province, city, ancestors) {
    list.forEach(function (n) {
      var lvl = level, c = city;
      if (level === 'province' && MUNI[n.name]) { lvl = 'county'; c = ''; }
      nodes.push({
        name: n.name, code: n.code, level: lvl,
        province: province || n.name, city: c, ancestors: ancestors
      });
      if (n.children) {
        var nextCity = (lvl === 'province')
          ? (MUNI[n.name] ? '' : n.name)
          : (lvl === 'city' ? n.name : c);
        walk(n.children, lvl === 'province' ? (MUNI[n.name] ? 'county' : 'city') : 'county',
          province || n.name, nextCity, ancestors.concat(n.name));
      }
    });
  }

  function buildIndex() {
    nodes = [];
    walk(ADMIN, 'province', '', '', []);
    byName = {};
    nodes.forEach(function (n) { (byName[n.name] = byName[n.name] || []).push(n); });

    aliasByNew = {};
    (ALIASES || []).forEach(function (a) {
      if (a && a.new && a.old && a.old.length) aliasByNew[a.new] = a;
    });
    uniIdx = (UNIVERSITIES || []).map(function (u) {
      var al = aliasByNew[u.name];
      var aliases = al ? (Array.isArray(al.old) ? al.old.slice() : [al.old]).filter(function (o) { return o && o !== u.name; }) : [];
      var aliasText = aliases.join(' ');
      return {
        name: u.name, city: u.city, province: u.province, type: u.type,
        aliases: aliases, aliasYear: al ? al.year : '', aliasKind: al ? al.kind : '',
        key: (u.name + ' ' + u.city + ' ' + u.province + ' ' + aliasText).toLowerCase()
      };
    });

    cityNodes = nodes.filter(function (n) { return n.level === 'city'; });
    countyNodes = nodes.filter(function (n) { return n.level === 'county'; });
  }

  function applyData(D, fromNet) {
    META = D.META; NATIONAL = D.NATIONAL; ADMIN = D.ADMIN; REAL = D.REAL;
    UNIVERSITIES = D.UNIVERSITIES; ALIASES = D.ALIASES; UNI_FEE = D.UNI_FEE;
    SUBSIDY_DEFAULT = D.SUBSIDY_DEFAULT;
    buildIndex();
    renderMeta();
    renderNational();
    renderProvinces();
    // 初始搜索：优先 URL ?q= 直达参数（便于分享具体查询链接），否则默认“浦江”
    var q0 = '';
    try {
      var qm = /[?&]q=([^&]+)/.exec(window.location.search || '');
      if (qm) q0 = decodeURIComponent(qm[1]);
    } catch (e) {}
    if (q0) { if ($q) $q.value = q0; smartSearch(q0); }
    else { if ($q) $q.value = '浦江'; smartSearch('浦江'); }
    currentMode = fromNet ? 'net' : 'local';
    updateModeUI();
  }

  function updateModeUI() {
    if (!$refresh) return;
    if (currentMode === 'net') {
      $refresh.disabled = false;
      if ($modeTip) $modeTip.textContent = '已联网加载，可点刷新获取最新数据';
    } else {
      $refresh.disabled = true;
      if ($modeTip) $modeTip.textContent = '当前为本地静态模式，部署到服务器后可刷新';
    }
  }

  async function load() {
    try {
      var res = await fetch('./data.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var D = await res.json();
      applyData(D, true);
    } catch (e) {
      if (window.__DATA) {
        applyData(window.__DATA, false);
      } else {
        if ($detail) $detail.innerHTML = '<div class="empty">数据加载失败：请通过本地服务器或部署后访问（直接双击打开需保留 data.js 等文件）。</div>';
        if ($udetail) $udetail.innerHTML = '<div class="empty">数据加载失败。</div>';
      }
    }
  }

  // ============ 渲染 ============
  function renderMeta() {
    if ($meta) $meta.textContent = '版本 ' + (META.version || '') + ' ｜ 数据更新时间：' + (META.update || '') + ' ｜ 集中征缴期多为 2026年9月—12月25日';
    if ($foot) $foot.textContent = META.update;
    if ($foot2) $foot2.textContent = META.update;
    if ($footC) $footC.textContent = META.createTime;
    if ($footV) $footV.textContent = META.version;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  // ============ 合并搜索：层级匹配工具 ============
  // 5 个自治区全称→简称，保证“广西”能命中“广西壮族自治区”
  var PROV_SHORT = { '内蒙古自治区': '内蒙古', '广西壮族自治区': '广西', '西藏自治区': '西藏', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆' };
  // 去掉行政区划后缀，用于“金华”≈“金华市”这类等价比较
  function stripSuffix(s) {
    s = String(s || '');
    if (PROV_SHORT[s]) return PROV_SHORT[s];
    return s.replace(/(特别行政区|自治区|自治州|省|市|县|区|盟|旗|地区)$/, '');
  }
  // 输入与标准地名是否指向同一行政区（精确，或去后缀后相等；≥2字防误伤）
  function suffixOf(s) {
    var m = String(s || '').match(/(特别行政区|自治区|自治州|省|市|县|区|盟|旗|地区)$/);
    return m ? m[1] : '';
  }
  function nameHit(input, name) {
    if (!input || !name) return false;
    if (name === input) return true;
    var a = stripSuffix(input), b = stripSuffix(name);
    if (a.length < 2 || a !== b) return false;
    var si = suffixOf(input), sn = suffixOf(name);
    if (si && sn && si !== sn) return false; // 后缀冲突：如“朝阳区”≠“朝阳市”
    return true;
  }
  // 生成输入的候选变体（含常见后缀补全），供精确匹配
  function genVariants(input) {
    var base = String(input || '').replace(/\s+/g, '');
    var seen = {}, out = [];
    function push(v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } }
    push(base);
    var s = stripSuffix(base);
    if (s && s !== base) { push(s); push(s + '市'); push(s + '县'); push(s + '区'); push(s + '省'); }
    return out;
  }
  // 省/市名是否匹配大学的所在地（大学 city 带“市”后缀）
  function placeHit(input, place) {
    if (!input || !place) return false;
    return stripSuffix(place) === stripSuffix(input) && stripSuffix(input).length >= 2;
  }
  function telify(s) {
    if (!s) return '';
    return esc(s).replace(/(\d[\d\-\/ ]{5,})/g, function (m) {
      var num = m.replace(/[\s\/]/g, '').replace(/-/g, '');
      return '<a class="tel" href="tel:' + num + '">' + m + '</a>';
    });
  }
  function row(k, v, isTel) {
    if (!v) return '';
    return '<div class="row"><div class="k">' + k + '</div><div class="v">' + (isTel ? telify(v) : esc(v)) + '</div></div>';
  }

  // ============ 资助参保对象（带继承回退） ============
  function getSubsidy(node) {
    if (!node) return SUBSIDY_DEFAULT;
    var chain = [node.name].concat(node.ancestors.slice().reverse());
    for (var i = 0; i < chain.length; i++) {
      if (REAL[chain[i]] && REAL[chain[i]].subsidy) return REAL[chain[i]].subsidy;
    }
    return SUBSIDY_DEFAULT;
  }

  // ============ 缴费截止倒计时 ============
  function parseOneRange(seg) {
    var dotRe = /(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[—\-~]\s*(?:(\d{4})\.(\d{1,2})\.(\d{1,2})|(\d{1,2})\.(\d{1,2})|(\d{1,2}))/;
    var m = seg.match(dotRe);
    if (m) {
      var sy = +m[1], sm = +m[2], sd = +m[3], ey, em, ed;
      if (m[4]) { ey = +m[4]; em = +m[5]; ed = +m[6]; }
      else if (m[7]) { ey = sy; em = +m[7]; ed = +m[8]; }
      else if (m[9]) { ey = sy; em = sm; ed = +m[9]; }
      return new Date(ey, em - 1, ed);
    }
    var cnRe = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*[—\-~]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/;
    var c = seg.match(cnRe);
    if (c) {
      var sy2 = +c[1], sm2 = +c[2], ey2, em2, ed2;
      if (c[4]) { ey2 = +c[4]; em2 = +c[5]; ed2 = +c[6]; }
      else { ey2 = sy2; em2 = +c[5]; ed2 = +c[6]; }
      return new Date(ey2, em2 - 1, ed2);
    }
    return null;
  }
  function parseDeadline(period) {
    if (!period) return null;
    var segs = period.split(/[；;]/), best = null;
    segs.forEach(function (seg) {
      var d = parseOneRange(seg);
      if (d && (!best || d > best)) best = d;
    });
    return best;
  }
  function countdownInfo(period) {
    var end = parseDeadline(period);
    if (!end) return null;
    var now = new Date();
    var endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    var nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((endDay - nowDay) / 86400000);
    var label = end.getFullYear() + '年' + (end.getMonth() + 1) + '月' + end.getDate() + '日';
    if (diff > 0) return { state: 'active', text: '距集中缴费截止还有 ' + diff + ' 天（截止 ' + label + '）' };
    if (diff === 0) return { state: 'today', text: '今天是集中缴费截止日（' + label + '），请尽快缴费' };
    return { state: 'ended', text: '集中缴费期已于 ' + label + ' 结束，补缴或特殊参保请以当地最新通告为准' };
  }
  function countdownHtml(period) {
    var info = countdownInfo(period);
    if (!info) return '';
    return '<div class="countdown ' + info.state + '">' + esc(info.text) + '</div>';
  }

  // ============ 分享图（canvas → PNG，纯前端） ============
  function wrapText(ctx, text, maxW) {
    text = String(text == null ? '' : text);
    var lines = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      var test = cur + ch;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = ch; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  function downloadCanvas(cv, filename) {
    if (cv.toBlob) {
      cv.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
      }, 'image/png');
    } else {
      var a2 = document.createElement('a');
      a2.href = cv.toDataURL('image/png'); a2.download = filename; a2.click();
    }
  }
  function makeShareImage(p) {
    var W = 750, pad = 32, x = pad;
    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d');
    var lineH = 30, rowGap = 16, headH = 96, footH = 64, discH = 60;
    var total = headH + footH + discH + 24;
    var layouts = [];
    p.rows.forEach(function (r) {
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
      var kL = wrapText(ctx, r.k, 150);
      ctx.font = '22px "Microsoft YaHei", sans-serif';
      var vL = wrapText(ctx, r.v, W - pad * 2 - 160);
      var lines = Math.max(kL.length, vL.length);
      var h = lines * lineH + rowGap;
      layouts.push({ k: kL, v: vL, h: h });
      total += h;
    });
    var countdownLines = [];
    if (p.countdown) {
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
      countdownLines = wrapText(ctx, p.countdown, W - pad * 2);
      total += countdownLines.length * lineH + rowGap;
    }
    cv.width = W; cv.height = total;
    ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, total);
    ctx.fillStyle = '#0a6ebd'; ctx.fillRect(0, 0, W, headH);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif'; ctx.fillText(p.title, pad, 36);
    ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(p.subtitle, pad, 68);
    var y = headH + 14;
    if (countdownLines.length) {
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#b4690e';
      countdownLines.forEach(function (ln) { ctx.fillText(ln, x, y + lineH / 2); y += lineH; });
      y += rowGap - 10;
    }
    layouts.forEach(function (L) {
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#075a9c';
      var ky = y + lineH / 2;
      L.k.forEach(function (ln, i) { ctx.fillText(ln, x, ky + i * lineH); });
      ctx.font = '22px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#1a1f24';
      L.v.forEach(function (ln, i) { ctx.fillText(ln, x + 160, ky + i * lineH); });
      y += L.h;
      ctx.strokeStyle = '#dfe5ea'; ctx.beginPath(); ctx.moveTo(x, y - rowGap / 2); ctx.lineTo(W - pad, y - rowGap / 2); ctx.stroke();
    });
    ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#5a6672';
    var dl = wrapText(ctx, p.disclaimer, W - pad * 2);
    dl.forEach(function (ln) { ctx.fillText(ln, x, y + 10); y += 20; });
    y = total - footH;
    ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#0a6ebd';
    ctx.fillText('蚂蚁哥医保查询 · 数据以当地医保局通告为准', pad, y + 18);
    ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#5a6672';
    ctx.fillText('shorver@163.com', pad, y + 40);
    downloadCanvas(cv, p.filename || '医保查询分享图.png');
  }
  function buildSharePayload(title, subtitle, rows, period, source) {
    var info = countdownInfo(period);
    return {
      title: title, subtitle: subtitle, rows: rows,
      countdown: info ? info.text : '',
      disclaimer: '本图由「蚂蚁哥医保查询」自动生成，为便民信息汇总，非官方经办渠道，具体以当地医保局通告为准。',
      filename: title + '_医保分享.png'
    };
  }
  function attachShare(container, payload) {
    var btn = container.querySelector('.share-btn');
    if (btn) btn.onclick = function () { makeShareImage(payload); flash(btn); };
  }
  function flash(btn) {
    var old = btn.textContent;
    btn.textContent = '✓ 已生成，正在下载…';
    setTimeout(function () { btn.textContent = old; }, 2000);
  }

  function renderNational() {
    if (!$nat) return;
    $nat.innerHTML = '';
    (NATIONAL || []).forEach(function (n) {
      var d = document.createElement('div'); d.className = 'nat';
      d.innerHTML = '<b>' + esc(n.name) + '</b><p>' + esc(n.desc) + '</p>';
      $nat.appendChild(d);
    });
  }

  function renderProvinces() {
    if (!$prov) return;
    $prov.innerHTML = '';
    (ADMIN || []).forEach(function (p) {
      var b = document.createElement('div'); b.className = 'prov'; b.textContent = p.name;
      b.onclick = function () {
        showProvince(p.name);
        var all = document.querySelectorAll('.prov');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
        b.classList.add('active');
      };
      $prov.appendChild(b);
    });
  }

  function getDetail(node) {
    var chain = [node.name].concat(node.ancestors.slice().reverse());
    for (var i = 0; i < chain.length; i++) {
      if (REAL[chain[i]]) {
        return { usedName: chain[i], usedLevel: REAL[chain[i]].level, data: REAL[chain[i]], inherited: chain[i] !== node.name };
      }
    }
    return null;
  }

  function showCandidates(kw) {
    kw = (kw || '').trim();
    $detail.innerHTML = '';
    if (!kw) { $cand.innerHTML = ''; return; }
    var hits = nodes.filter(function (n) {
      if (n.name.indexOf(kw) >= 0) return true;
      if (n.province.indexOf(kw) >= 0) return true;
      if (n.city && n.city.indexOf(kw) >= 0) return true;
      var res = getDetail(n);
      if (res && res.data) {
        var d = res.data;
        var hay = [d.fee, d.period, d.online, d.offline, d.note, d.medical, d.tax].join(' ');
        if (hay.indexOf(kw) >= 0) return true;
      }
      return false;
    }).slice(0, 30);
    if (!hits.length) { $cand.innerHTML = '<div class="empty">未找到匹配的地区，试试只输入城市/县名，如“金华”“浦江”。</div>'; return; }
    $cand.innerHTML = '';
    hits.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'cand-item';
      d.innerHTML = '<span class="nm">' + esc(h.name) + '</span><span class="lv">' + LV[h.level] + '</span>' +
        '<div class="pa">' + esc(h.province) + (h.city ? ' ／ ' + h.city : '') + '</div>';
      d.onclick = function () { renderDetail(h); };
      $cand.appendChild(d);
    });
  }

  // ===== 合并搜索：智能判断层级，一个入口同时返回地区与大学 =====
  // 匹配规则：省(ADMIN顶层，含直辖市) > 市(cityNodes) > 区/县(countyNodes) > 大学(校名/别名)；
  // 命中多个同名(重名/歧义)则列出候选(带省/市路径)；都不命中走全文回退(地区+大学混合)。
  function smartSearch(input) {
    var kw = (input || '').trim().replace(/\s+/g, '');
    $detail.innerHTML = '';
    if (!kw) { $cand.innerHTML = ''; return; }
    var provHits = (ADMIN || []).filter(function (p) { return nameHit(kw, p.name); });
    if (provHits.length) { showProvince(provHits[0].name); return; }

    var cityHits = cityNodes.filter(function (n) { return nameHit(kw, n.name); });
    if (cityHits.length === 1) { renderCityMerge(cityHits[0]); return; }
    if (cityHits.length > 1) { renderChoiceList(cityHits, '市级'); return; }

    var countyHits = countyNodes.filter(function (n) { return nameHit(kw, n.name); });
    if (countyHits.length === 1) { renderDetail(countyHits[0]); return; }
    if (countyHits.length > 1) { renderChoiceList(countyHits, '区/县级'); return; }

    var uniHits = uniIdx.filter(function (u) {
      return u.name.indexOf(kw) >= 0 || (u.aliases && u.aliases.some(function (a) { return a.indexOf(kw) >= 0; }));
    });
    if (uniHits.length === 1) { renderUniTo($detail, uniHits[0]); return; }
    if (uniHits.length > 1) { renderUniChoiceList(uniHits); return; }

    fullTextFallback(kw);
  }

  // 重名/歧义候选列表（同名多个地区）
  function renderChoiceList(list, label) {
    $cand.innerHTML = '';
    list.forEach(function (n) {
      var d = document.createElement('div'); d.className = 'cand-item';
      d.innerHTML = '<span class="nm">' + esc(n.name) + '</span><span class="lv">' + esc(label) + '</span>' +
        '<div class="pa">' + esc(n.province) + (n.city && n.city !== n.province ? ' ／ ' + esc(n.city) : '') + '</div>';
      d.onclick = function () { if (n.level === 'city') renderCityMerge(n); else renderDetail(n); };
      $cand.appendChild(d);
    });
    $detail.innerHTML = '<div class="empty">检测到多个同名“' + esc(list[0].name) + '”（' + esc(label) +
      '），请点击上方具体的一个以查看。</div>';
  }

  // 大学多候选列表
  function renderUniChoiceList(list) {
    $cand.innerHTML = '';
    list.forEach(function (u) {
      var d = document.createElement('div'); d.className = 'cand-item';
      var tag = u.type === 'vocational' ? '高职' : (u.type === 'chengren' ? '成人' : '本科');
      d.innerHTML = '<span class="nm">' + esc(u.name) + '</span><span class="lv">' + tag + '</span>' +
        (u.aliases && u.aliases.length ? '<span class="alttag">原：' + esc(u.aliases.join('、')) + '</span>' : '') +
        '<div class="pa">' + esc(u.province) + ' ／ ' + esc(u.city) + '</div>';
      d.onclick = function () { renderUniTo($detail, u); };
      $cand.appendChild(d);
    });
    $detail.innerHTML = '';
  }

  // 全文回退：地区全文 + 大学混合候选
  function fullTextFallback(kw) {
    var k = kw.toLowerCase();
    var rhits = nodes.filter(function (n) {
      if (n.name.indexOf(kw) >= 0) return true;
      if (n.province.indexOf(kw) >= 0) return true;
      if (n.city && n.city.indexOf(kw) >= 0) return true;
      var res = getDetail(n);
      if (res && res.data) {
        var d = res.data;
        var hay = [d.fee, d.period, d.online, d.offline, d.note, d.medical, d.tax].join(' ');
        if (hay.indexOf(kw) >= 0) return true;
      }
      return false;
    }).slice(0, 20);
    var uhits = uniIdx.filter(function (u) {
      return u.name.indexOf(kw) >= 0 || u.key.indexOf(k) >= 0 ||
        (u.aliases && u.aliases.some(function (a) { return a.indexOf(kw) >= 0; }));
    }).slice(0, 15);
    if (!rhits.length && !uhits.length) {
      $cand.innerHTML = '<div class="empty">未找到与“' + esc(kw) + '”相关的地区或高校，可尝试更简短的关键词。</div>';
      return;
    }
    $cand.innerHTML = '';
    rhits.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'cand-item';
      d.innerHTML = '<span class="nm">' + esc(h.name) + '</span><span class="lv">' + LV[h.level] + '</span>' +
        '<div class="pa">' + esc(h.province) + (h.city && h.city !== h.province ? ' ／ ' + esc(h.city) : '') + '</div>';
      d.onclick = function () { if (h.level === 'city') renderCityMerge(h); else renderDetail(h); };
      $cand.appendChild(d);
    });
    uhits.forEach(function (u) {
      var d = document.createElement('div'); d.className = 'cand-item';
      var tag = u.type === 'vocational' ? '高职' : (u.type === 'chengren' ? '成人' : '本科');
      d.innerHTML = '<span class="nm">' + esc(u.name) + '</span><span class="lv">' + tag + '</span>' +
        '<div class="pa">' + esc(u.province) + ' ／ ' + esc(u.city) + '</div>';
      d.onclick = function () { renderUniTo($detail, u); };
      $cand.appendChild(d);
    });
  }

  function renderDetail(node) {
    $cand.innerHTML = '';
    var res = getDetail(node);
    if (!res) { $detail.innerHTML = '<div class="empty">暂无该地区数据。</div>'; return; }
    var d = res.data;
    var html = '';
    html += '<div class="detail"><div class="head"><div class="t">' + esc(node.name) + '</div>' +
      '<div class="s">' + LV[node.level] + (node.province ? ' ｜ ' + esc(node.province) : '') + (node.city ? ' ／ ' + esc(node.city) : '') + '</div></div>';
    if (res.inherited) {
      html += '<div class="inherit">以下为【' + esc(res.usedName) + '】统一征缴标准。该地（' + esc(node.name) +
        '）未单独发布独立通告，具体缴费标准、起止时间、资助政策以当地最新通告为准。</div>';
    }
    html += countdownHtml(d.period);
    html += row('医保咨询', d.medical, true);
    html += row('税务缴费', d.tax, true);
    html += row('2027个人缴费', d.fee);
    html += row('缴费时间', d.period);
    html += row('线上缴费', d.online);
    html += row('线下渠道', d.offline);
    html += row('备注', d.note);
    html += row('资助参保对象', getSubsidy(node));
    html += '<button class="share-btn">📤 生成分享图（PNG）</button>';
    html += '<div class="src">数据来源：' + esc(d.source || '各地医保局/税务局公开通告') + '</div>';
    html += DISCLAIMER;
    html += '</div>';
    $detail.innerHTML = html;
    var shareRows = [
      { k: '医保咨询', v: d.medical || '—' },
      { k: '税务缴费', v: d.tax || '—' },
      { k: '2027个人缴费', v: d.fee || '—' },
      { k: '缴费时间', v: d.period || '—' },
      { k: '线上缴费', v: d.online || '—' },
      { k: '线下渠道', v: d.offline || '—' },
      { k: '备注', v: d.note || '—' },
      { k: '资助参保对象', v: getSubsidy(node) }
    ];
    attachShare($detail, buildSharePayload(
      node.name + (res.inherited ? '（沿用' + res.usedName + '）' : ''),
      (LV[node.level] || '') + (node.province ? ' ｜ ' + node.province : '') + (node.city ? ' ／ ' + node.city : ''),
      shareRows, d.period, d.source));
    $detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ===== 合并搜索：节点定位与渲染辅助 =====
  function findRegionNode(province, level, name) {
    var arr = byName[name] || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].province === province && arr[i].level === level) return arr[i];
    }
    return arr[0] || null;
  }
  function uniByName(name) {
    for (var i = 0; i < uniIdx.length; i++) { if (uniIdx[i].name === name) return uniIdx[i]; }
    return null;
  }
  function uniRank(u) { return u.type === 'vocational' ? 1 : (u.type === 'chengren' ? 2 : 0); }
  function renderUniItems(list, limit) {
    var arr = list.slice().sort(function (a, b) { return uniRank(a) - uniRank(b) || (a.name < b.name ? -1 : 1); });
    var shown = arr.slice(0, limit || 40), html = '';
    shown.forEach(function (u) {
      var tag = u.type === 'vocational' ? '高职' : (u.type === 'chengren' ? '成人' : '本科');
      var cls = u.type === 'vocational' ? 'tv' : (u.type === 'chengren' ? 'tc' : 'tb');
      html += '<div class="uni-item" data-un="' + esc(u.name) + '">' +
        '<span class="un">' + esc(u.name) + '</span>' +
        '<span class="ut ' + cls + '">' + tag + '</span>' +
        '<span class="uc">' + esc(u.city) + '</span></div>';
    });
    if (arr.length > shown.length) html += '<div class="more-hint">共 ' + arr.length + ' 所，已显示前 ' + shown.length + ' 所；输入完整校名可精确定位。</div>';
    return html;
  }
  function regionChip(province, level, name, sub, has) {
    return '<div class="region-chip" data-rp="' + esc(province) + '" data-rl="' + level + '" data-rn="' + esc(name) + '">' +
      '<span class="rn">' + esc(name) + '</span>' +
      '<span class="rt ' + (has ? 'has' : 'none') + '">' + esc(sub) + '</span></div>';
  }
  function bindMergeClicks(container) {
    Array.prototype.forEach.call(container.querySelectorAll('.region-chip'), function (el) {
      el.onclick = function () {
        var node = findRegionNode(el.getAttribute('data-rp'), el.getAttribute('data-rl'), el.getAttribute('data-rn'));
        if (node) { if (node.level === 'city') renderCityMerge(node); else renderDetail(node); }
      };
    });
    Array.prototype.forEach.call(container.querySelectorAll('.uni-item'), function (el) {
      el.onclick = function () { var u = uniByName(el.getAttribute('data-un')); if (u) renderUniTo($detail, u); };
    });
  }
  function standardShareRows(d, name, ancestors) {
    return [
      { k: '医保咨询', v: d.medical || '—' },
      { k: '税务缴费', v: d.tax || '—' },
      { k: '2027个人缴费', v: d.fee || '—' },
      { k: '缴费时间', v: d.period || '—' },
      { k: '线上缴费', v: d.online || '—' },
      { k: '线下渠道', v: d.offline || '—' },
      { k: '备注', v: d.note || '—' },
      { k: '资助参保对象', v: getSubsidy({ name: name, ancestors: ancestors || [] }) }
    ];
  }
  function standardBody(d, name, ancestors) {
    var html = '';
    html += countdownHtml(d.period);
    html += row('医保咨询', d.medical, true);
    html += row('税务缴费', d.tax, true);
    html += row('2027个人缴费', d.fee);
    html += row('缴费时间', d.period);
    html += row('线上缴费', d.online);
    html += row('线下渠道', d.offline);
    html += row('备注', d.note);
    html += row('资助参保对象', getSubsidy({ name: name, ancestors: ancestors || [] }));
    html += '<button class="share-btn">📤 生成分享图（PNG）</button>';
    html += '<div class="src">数据来源：' + esc(d.source || '各地医保局/税务局公开通告') + '</div>';
    html += DISCLAIMER;
    return html;
  }

  // 省级聚合：省/直辖市通用标准 + 下辖地区 chips + 省内大学
  function showProvince(pname) {
    $cand.innerHTML = '';
    var prov = (ADMIN || []).filter(function (p) { return p.name === pname; })[0];
    if (!prov) return;
    var res = REAL[pname];
    var isMuni = !!MUNI[pname];
    var children = prov.children || [];
    var univs = uniIdx.filter(function (u) { return u.province === pname; });
    var html = '';
    html += '<div class="detail"><div class="head"><div class="t">' + esc(pname) + '</div>' +
      '<div class="s">' + (isMuni ? '直辖市' : '省级') + ' · 下辖地区 + 在校大学</div></div>';
    if (res) {
      html += standardBody(res, pname, []);
    } else {
      html += '<div class="empty">该' + (isMuni ? '市' : '省') + '暂无统一征缴标准，请进入下辖地区查看。</div>';
    }
    html += '<div class="merge-sec">' + (isMuni ? '下辖' : '下辖市级') + '地区（' + children.length + '）</div><div class="merge-grid">';
    children.forEach(function (c) {
      var cnt = (c.children || []).length;
      var fn = findRegionNode(pname, isMuni ? 'county' : 'city', c.name);
      var has = !!(fn && REAL[fn.name]);
      html += regionChip(pname, isMuni ? 'county' : 'city', c.name, has ? '有标准' : (cnt ? cnt + '个区县' : '看上级'), has);
    });
    html += '</div>';
    html += '<div class="merge-sec">省内大学（' + univs.length + '）</div>';
    html += univs.length ? ('<div class="uni-list">' + renderUniItems(univs, 40) + '</div>') : '<div class="empty">暂无收录的省内高校。</div>';
    html += '</div>';
    $detail.innerHTML = html;
    if (res) attachShare($detail, buildSharePayload(pname + (isMuni ? '（直辖市）' : '（全省/市通用）'), (isMuni ? '直辖市' : '省级') + '征缴总览', standardShareRows(res, pname, []), res.period, res.source));
    bindMergeClicks($detail);
    $detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 市级聚合：市标准 + 下辖区县 chips + 市内大学
  function renderCityMerge(node) {
    $cand.innerHTML = '';
    var cityName = node.name;
    var cityRes = resolveReal(cityName);
    var data = cityRes || REAL[node.province] || null;
    var inherited = !cityRes;
    var counties = countyNodes.filter(function (c) { return c.province === node.province && c.city === cityName; });
    var univs = uniIdx.filter(function (u) { return placeHit(u.city, cityName); });
    var html = '';
    html += '<div class="detail"><div class="head"><div class="t">' + esc(cityName) + '</div>' +
      '<div class="s">市级 · 下辖区县 + 在校大学 ｜ ' + esc(node.province) + '</div></div>';
    if (data) {
      if (inherited) html += '<div class="inherit">该市未单独发布通告，以下为【' + esc(node.province) + '】统一标准，具体以当地最新通告为准。</div>';
      html += standardBody(data, cityName, [node.province]);
    } else {
      html += '<div class="empty">暂无该市及所属省统一标准，请进入下辖区县查看。</div>';
    }
    html += '<div class="merge-sec">下辖县级地区（' + counties.length + '）</div><div class="merge-grid">';
    counties.forEach(function (c) {
      var has = !!REAL[c.name];
      html += regionChip(c.province, 'county', c.name, has ? '有标准' : '看上级', has);
    });
    html += '</div>';
    html += '<div class="merge-sec">市内大学（' + univs.length + '）</div>';
    html += univs.length ? ('<div class="uni-list">' + renderUniItems(univs, 60) + '</div>') : '<div class="empty">暂无收录的市内高校。</div>';
    html += '</div>';
    $detail.innerHTML = html;
    if (data) attachShare($detail, buildSharePayload(cityName + (inherited ? '（沿用' + node.province + '）' : ''), '市级 · ' + node.province, standardShareRows(data, cityName, [node.province]), data.period, data.source));
    bindMergeClicks($detail);
    $detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ===== 大学查询 =====
  function resolveReal(name) {
    var tries = [name, name.replace(/市$/, ''), name + '市'];
    for (var i = 0; i < tries.length; i++) { if (REAL[tries[i]]) return REAL[tries[i]]; }
    return null;
  }
  function uniSeg(fee) {
    if (!fee) return null;
    var segs = fee.split(/[；;]/);
    for (var i = 0; i < segs.length; i++) { if (segs[i].indexOf('大学生') >= 0) return segs[i].trim(); }
    return null;
  }

  function showUniCandidates(kw) {
    kw = (kw || '').trim();
    $udetail.innerHTML = '';
    if (!kw) { $ucand.innerHTML = ''; return; }
    var k = kw.toLowerCase();
    var hits = uniIdx.filter(function (u) { return u.name.indexOf(kw) >= 0 || u.key.indexOf(k) >= 0; }).slice(0, 15);
    if (!hits.length) { $ucand.innerHTML = '<div class="empty">未找到匹配的高校，试试只输入校名关键词，如“浙大”“武汉”“师范”。</div>'; return; }
    $ucand.innerHTML = '';
    hits.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'cand-item';
      var lv = h.type === 'vocational' ? '高职' : (h.type === 'chengren' ? '成人' : '本科');
      d.innerHTML = '<span class="nm">' + esc(h.name) + '</span><span class="lv">' + lv + '</span>' +
        (h.aliases && h.aliases.length ? '<span class="alttag">原：' + esc(h.aliases.join('、')) + '</span>' : '') +
        '<div class="pa">' + esc(h.province) + ' ／ ' + esc(h.city) + '</div>';
      d.onclick = function () { renderUni(h); };
      $ucand.appendChild(d);
    });
  }

  function renderUni(u) { $ucand.innerHTML = ''; renderUniTo($udetail, u); }
  function renderUniTo(container, u) {
    var provReal = REAL[u.province] || null;
    var cityReal = resolveReal(u.city);
    var feeObj = UNI_FEE[u.city];
    var isChengren = (u.type === 'chengren');
    var fee, period, online, note, source, provFallback = false;
    if (isChengren) {
      if (cityReal) { fee = cityReal.fee; period = cityReal.period; online = cityReal.online; note = cityReal.note; source = cityReal.source; }
      else if (provReal) { fee = provReal.fee; period = provReal.period; online = provReal.online; note = provReal.note; source = provReal.source; provFallback = true; }
    } else if (feeObj) {
      fee = feeObj.fee; period = feeObj.period; online = feeObj.online; note = feeObj.note; source = feeObj.source;
    } else if (cityReal) {
      fee = uniSeg(cityReal.fee) || cityReal.fee; period = cityReal.period; online = cityReal.online; note = cityReal.note; source = cityReal.source;
    } else if (provReal) {
      fee = uniSeg(provReal.fee) || provReal.fee; period = provReal.period; online = provReal.online; note = provReal.note; source = provReal.source; provFallback = true;
    }
    if (!fee) { container.innerHTML = '<div class="empty">暂未收录该校所在地（' + esc(u.city) + '）的大学生医保标准。</div>'; return; }

    var phone = (cityReal && cityReal.medical) || (provReal && provReal.medical) || '';
    var tax = (cityReal && cityReal.tax) || (provReal && provReal.tax) || '';
    var level = u.type === 'vocational' ? '高职（专科）' : (u.type === 'chengren' ? '成人高校' : '本科');
    var html = '';
    html += '<div class="detail"><div class="head"><div class="t">' + esc(u.name) + '</div>' +
      '<div class="s">' + level + '·在校学生医保 ｜ ' + esc(u.province) + ' ／ ' + esc(u.city) + '</div></div>';
    var intro;
    if (isChengren) {
      intro = '成人高校（开放大学/广播电视大学/职工大学/管理干部学院等）学生多为在职或非全日制，一般参加职工医保或城乡居民医保（一般居民档），通常不适用全日制“大学生”档。以下为该地 2027 年度城乡居民医保一般标准，具体以学校及当地医保部门通知为准。';
    } else if (provFallback) {
      intro = '该校所在地「' + esc(u.city) + '」为省/自治区直辖县级行政单位，暂按「' + esc(u.province) + '」统一标准执行；具体以当地医保部门及学校通知为准。';
    } else {
      intro = '在校学生（含高职专科）医保一般由学校统一组织参保，缴费标准执行学校所在地市的“大学生”档。以下为该地 2027 年度标准。';
    }
    html += '<div class="inherit" style="background:#eef7ff;border-color:#bcdcff;color:#134">' + intro + '</div>';
    html += row('办学层次', level);
    if (u.aliases && u.aliases.length) {
      html += row('原校名', u.aliases.join('、') + (u.aliasYear ? '（' + u.aliasYear + ' 年' + (u.aliasKind || '变更') + '）' : ''));
    }
    html += countdownHtml(period);
    html += row('医保咨询', phone, true);
    html += row('税务缴费', tax, true);
    html += row(isChengren ? '2027城乡居民个人缴费（一般档）' : '2027大学生个人缴费', fee);
    html += row('缴费时间', period);
    html += row('参保/缴费方式', online);
    html += row('备注', note);
    html += row('资助参保对象', getSubsidy({ name: u.city, ancestors: [u.province] }));
    html += '<button class="share-btn">📤 生成分享图（PNG）</button>';
    html += '<div class="src">数据来源：' + esc(source || '各地医保局/税务局/高校官网公开通告') + '</div>';
    html += DISCLAIMER;
    html += '</div>';
    container.innerHTML = html;
    var uShareRows = [
      { k: '办学层次', v: level },
      { k: '医保咨询', v: phone || '—' },
      { k: '税务缴费', v: tax || '—' },
      { k: isChengren ? '2027城乡居民个人缴费（一般档）' : '2027大学生个人缴费', v: fee || '—' },
      { k: '缴费时间', v: period || '—' },
      { k: '参保/缴费方式', v: online || '—' },
      { k: '备注', v: note || '—' },
      { k: '资助参保对象', v: getSubsidy({ name: u.city, ancestors: [u.province] }) }
    ];
    attachShare(container, buildSharePayload(u.name, level + '·在校学生医保 ｜ ' + u.province + ' ／ ' + u.city, uShareRows, period, source));
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ===== 页签切换 =====
  var $tabRegion = document.getElementById('tabRegion');
  var $tabUni = document.getElementById('tabUni');
  var $regionPanel = document.getElementById('regionPanel');
  var $uniPanel = document.getElementById('uniPanel');

  function bindEvents() {
    document.getElementById('go').onclick = function () { smartSearch($q.value); };
    $q.addEventListener('input', function () { smartSearch($q.value); });
    $q.addEventListener('keydown', function (e) { if (e.key === 'Enter') smartSearch($q.value); });

    document.getElementById('ugo').onclick = function () { showUniCandidates($uq.value); };
    $uq.addEventListener('input', function () { showUniCandidates($uq.value); });
    $uq.addEventListener('keydown', function (e) { if (e.key === 'Enter') showUniCandidates($uq.value); });

    $tabRegion.onclick = function () {
      $tabRegion.classList.add('active'); $tabUni.classList.remove('active');
      $regionPanel.style.display = ''; $uniPanel.style.display = 'none';
    };
    $tabUni.onclick = function () {
      $tabUni.classList.add('active'); $tabRegion.classList.remove('active');
      $uniPanel.style.display = ''; $regionPanel.style.display = 'none';
      $uq.focus();
    };

    if ($refresh) $refresh.onclick = function () {
      if (currentMode === 'net') { load(); }
      else if ($modeTip) { $modeTip.textContent = '本地静态模式无法刷新，请部署到服务器后访问'; }
    };
  }

  // 启动
  bindEvents();
  load();
})();
