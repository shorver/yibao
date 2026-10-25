// 2027年度城乡居民医保征缴查询 — 前端逻辑
// 数据优先从 ./data.json 异步加载（支持刷新）；file:// 双击打开时降级到全局 <script> 变量。
(function () {
  'use strict';

  // —— 可变数据（applyData 时赋值）——
  var META, NATIONAL, ADMIN, REAL, UNIVERSITIES, ALIASES, UNI_FEE;
  var nodes = [], byName = {}, uniIdx = [], aliasByNew = {};
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
  }

  function applyData(D, fromNet) {
    META = D.META; NATIONAL = D.NATIONAL; ADMIN = D.ADMIN; REAL = D.REAL;
    UNIVERSITIES = D.UNIVERSITIES; ALIASES = D.ALIASES; UNI_FEE = D.UNI_FEE;
    buildIndex();
    renderMeta();
    renderNational();
    renderProvinces();
    showCandidates('浦江');
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
    var hits = nodes.filter(function (n) { return n.name.indexOf(kw) >= 0; }).slice(0, 15);
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
    html += row('医保咨询', d.medical, true);
    html += row('税务缴费', d.tax, true);
    html += row('2027个人缴费', d.fee);
    html += row('缴费时间', d.period);
    html += row('线上缴费', d.online);
    html += row('线下渠道', d.offline);
    html += row('备注', d.note);
    html += '<div class="src">数据来源：' + esc(d.source || '各地医保局/税务局公开通告') + '</div>';
    html += DISCLAIMER;
    html += '</div>';
    $detail.innerHTML = html;
    $detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showProvince(pname) {
    $cand.innerHTML = '';
    var prov = (ADMIN || []).filter(function (p) { return p.name === pname; })[0];
    if (!prov) return;
    var res = REAL[pname];
    var html = '';
    html += '<div class="detail"><div class="head"><div class="t">' + esc(pname) + '（全省/市通用）</div>' +
      '<div class="s">省级征缴总览</div></div>';
    if (res) {
      html += row('医保咨询', res.medical, true);
      html += row('税务缴费', res.tax, true);
      html += row('2027个人缴费', res.fee);
      html += row('缴费时间', res.period);
      html += row('线上缴费', res.online);
      html += row('线下渠道', res.offline);
      html += row('备注', res.note);
      html += '<div class="src">数据来源：' + esc(res.source || '各地医保局/税务局公开通告') + '</div>';
      html += DISCLAIMER;
    }
    var cities = (prov.children || []);
    html += '<div style="padding:12px 16px;border-top:1px solid var(--line)"><div class="k" style="font-weight:700;color:var(--brand-d)">下辖地区（点击查看/继承标准）：</div><div class="city-list">';
    cities.forEach(function (c) {
      var cnt = (c.children || []).length;
      html += '<div class="city-chip" data-c="' + esc(c.name) + '">' + esc(c.name) +
        '<span class="cnt">' + (cnt ? cnt + '个区县' : '市直') + '</span></div>';
    });
    html += '</div></div></div>';
    $detail.innerHTML = html;
    Array.prototype.forEach.call($detail.querySelectorAll('.city-chip'), function (chip) {
      chip.onclick = function () {
        var name = chip.getAttribute('data-c');
        var node = (byName[name] || [])[0];
        if (node) renderDetail(node);
      };
    });
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

  function renderUni(u) {
    $ucand.innerHTML = '';
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
    if (!fee) { $udetail.innerHTML = '<div class="empty">暂未收录该校所在地（' + esc(u.city) + '）的大学生医保标准。</div>'; return; }

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
    html += row('医保咨询', phone, true);
    html += row('税务缴费', tax, true);
    html += row(isChengren ? '2027城乡居民个人缴费（一般档）' : '2027大学生个人缴费', fee);
    html += row('缴费时间', period);
    html += row('参保/缴费方式', online);
    html += row('备注', note);
    html += '<div class="src">数据来源：' + esc(source || '各地医保局/税务局/高校官网公开通告') + '</div>';
    html += DISCLAIMER;
    html += '</div>';
    $udetail.innerHTML = html;
    $udetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ===== 页签切换 =====
  var $tabRegion = document.getElementById('tabRegion');
  var $tabUni = document.getElementById('tabUni');
  var $regionPanel = document.getElementById('regionPanel');
  var $uniPanel = document.getElementById('uniPanel');

  function bindEvents() {
    document.getElementById('go').onclick = function () { showCandidates($q.value); };
    $q.addEventListener('input', function () { showCandidates($q.value); });
    $q.addEventListener('keydown', function (e) { if (e.key === 'Enter') showCandidates($q.value); });

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
