#!/usr/bin/env node
/**
 * build_offline.js — 生成「蚂蚁哥医保查询」HTML 单文件离线版
 *
 * 将网页版全部资源内联进一个 .html：
 *   style.css / data.js / universities.js / aliases.js / uni_fee.js / app.js / 图标(data:URI)
 * 并在页尾附加「版本与更新」面板（内置 5 个仓库地址，便于换电脑使用与后续更新下载）。
 *
 * 版本号取自 data.js 的 META.version，与网页版 / 仓库 / skill / Rust 单文件版保持一致，不在此处单独维护。
 * 用法：node build_offline.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readB64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');

// 版本号与数据源同根：取自 data.js 的 META
const META = new Function(read('data.js') + '\nreturn META;')();
const VERSION = META.version || 'v1.0.4';

// 内联防御：JS/CSS 源码中若出现 </script 或 </style（正常不会有），转义为 <\/ 防止提前闭合
function safeInline(s, closer) {
  return s.split(closer).join(closer.replace('/', '\\/'));
}

// 必须命中才替换，避免静默出错
function mustReplace(html, re, repl, label) {
  if (!re.test(html)) throw new Error('未找到待替换内容: ' + label);
  return html.replace(re, repl);
}

const REPOS = [
  { name: 'Gitee', url: 'https://gitee.com/shorver/yi-bao' },
  { name: 'GitCode', url: 'https://gitcode.net/shorver/yibao' },
  { name: 'AtomGit', url: 'https://atomgit.com/shorver/yibao' },
  { name: 'CNB', url: 'https://cnb.cool/shorver/yibao' },
  { name: 'GitHub', url: 'https://github.com/shorver/yibao' },
];

let html = read('index.html');

// 1) 标题标注离线版与版本
html = mustReplace(
  html,
  /<title>[\s\S]*?<\/title>/,
  '<title>蚂蚁哥医保查询 - 2027年度城乡居民医保征缴信息（离线单文件版 ' + VERSION + '）</title>',
  'title'
);

// 2) 图标转 data:URI（离线双击也能显示站点图标）
html = mustReplace(
  html,
  /<link rel="icon" type="image\/png" sizes="32x32" href="[^"]*">/,
  '<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,' + readB64('icon/icon_32.png') + '">',
  'icon 32'
);
html = mustReplace(
  html,
  /<link rel="apple-touch-icon" sizes="180x180" href="[^"]*">/,
  '<link rel="apple-touch-icon" sizes="180x180" href="data:image/png;base64,' + readB64('icon/icon_180.png') + '">',
  'icon 180'
);

// 3) CSS 内联
html = mustReplace(
  html,
  /<link rel="stylesheet" href="style\.css\?v=[0-9.]+">/,
  '<style>\n' + safeInline(read('style.css'), '</style') + '\n</style>',
  'style.css'
);

// 4) 四个数据脚本内联（file:// 下 fetch 会失败，app.js 自动回退 window.__DATA，逻辑与网页版一致）
['data.js', 'universities.js', 'aliases.js', 'uni_fee.js'].forEach(function (f) {
  var re = new RegExp('<script src="' + f.replace(/\./g, '\\.') + '\\?v=[0-9.]+"><\\/script>');
  html = mustReplace(html, re, '<script>\n' + safeInline(read(f), '</script') + '\n</script>', f);
});

// 5) app.js 内联（仅将“部署到服务器后可刷新”提示改为离线版表述，其余代码与仓库版完全一致）
html = mustReplace(
  html,
  /<script src="app\.js\?v=[0-9.]+"><\/script>/,
  '<script>\n' + safeInline(read('app.js'), '</script').replace(
    '当前为本地静态模式，部署到服务器后可刷新',
    '离线单文件版：数据已内嵌，获取最新数据请下载新版替换'
  ) + '\n</script>',
  'app.js'
);

// 6) 更新面板样式（复用主样式 CSS 变量，追加在 </head> 前）
var panelCss = [
  '.ofu{max-width:880px;margin:20px auto 0;padding:0 14px}',
  '.ofu-box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:15px}',
  '.ofu-t{font-weight:800;color:var(--brand-d);font-size:17px;margin-bottom:8px}',
  '.ofu-v{margin:0 0 8px;line-height:1.6}',
  '.ofu-repos{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}',
  '.ofu-repos a{display:inline-block;padding:6px 16px;border:1px solid var(--brand);color:var(--brand-d);border-radius:999px;text-decoration:none;font-weight:700;background:#fff;font-size:15px}',
  '.ofu-repos a:hover{background:var(--brand);color:#fff}',
  '.ofu-n{color:var(--sub);font-size:13px;margin:8px 0 0;line-height:1.5}',
].join('\n');
html = html.replace('</head>', '<style>\n' + panelCss + '\n</style>\n</head>');

// 7) 更新面板 HTML（置于页脚上方）
var reposHtml = REPOS.map(function (r) {
  return '<a href="' + r.url + '" target="_blank" rel="noopener">' + r.name + '</a>';
}).join('');
var panelHtml = [
  '<section class="ofu">',
  '  <div class="ofu-box">',
  '    <div class="ofu-t">离线单文件版 · 版本与更新</div>',
  '    <p class="ofu-v">当前版本 <b>' + VERSION + '</b>，与网页版、Rust 单文件版（exe）、AI 查询技能为同一版本号。本文件数据已全部内嵌，可拷贝到任意 Windows 电脑双击使用，无需安装环境、无需联网。</p>',
  '    <p class="ofu-v">数据有更新时，到下面任一代码仓库下载最新版单文件（仓库根目录，文件名形如「蚂蚁哥医保查询离线版v1.0.5.html」），替换本文件即可。</p>',
  '    <div class="ofu-repos">' + reposHtml + '</div>',
  '    <p class="ofu-n">本工具为便民信息汇总，非官方经办渠道，医保政策以当地医保局最新通告为准。制作人：浦江蚂蚁哥（shorver@163.com）</p>',
  '  </div>',
  '</section>',
].join('\n  ');
html = html.replace('<footer class="foot">', panelHtml + '\n\n  <footer class="foot">');

// 8) 自检：不得残留任何外链资源
var problems = [];
if (/<script[^>]+src=/.test(html)) problems.push('残留外链 script');
if (/<link[^>]+href="(?!data:)/.test(html)) problems.push('残留外链 link');
if (/\?v=[0-9.]+/.test(html)) problems.push('残留 ?v= 版本参数');
REPOS.forEach(function (r) { if (html.indexOf(r.url) < 0) problems.push('缺少仓库地址 ' + r.name); });
if (html.indexOf(VERSION) < 0) problems.push('缺少版本号 ' + VERSION);
if (problems.length) {
  console.error('自检未通过:\n - ' + problems.join('\n - '));
  process.exit(1);
}

// 9) 输出（UTF-8 无 BOM）
var outName = '蚂蚁哥医保查询离线版' + VERSION + '.html';
fs.writeFileSync(path.join(ROOT, outName), html, 'utf8');
var kb = (fs.statSync(path.join(ROOT, outName)).size / 1024).toFixed(0);
console.log('已生成 ' + outName + '（' + kb + ' KB，版本 ' + VERSION + '）');
console.log('自检通过：无外链资源，5 个仓库地址已在页内。');
