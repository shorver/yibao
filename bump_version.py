# -*- coding: utf-8 -*-
# 全端版本号 v1.0.6 -> v1.0.7、更新日期 -> 2026-11-08
# icon.rc 为 GBK 编码（rc.exe 读取），必须按 GBK 读写，不可改成 UTF-8
import io, os

ROOT = r'D:\我的文档\WorkBuddy\医保'
UTF8_FILES = [
    'data.js',
    'index.html',
    'yibao-exe/assets/index.html',
    'yibao-exe/Cargo.toml',
    'yibao-exe/Cargo.lock',
    'yibao-exe/src/main.rs',
    'yibao-query/SKILL.md',
    'build_offline.js',
]
GBK_FILES = ['yibao-exe/assets/icon.rc']

def bump(s):
    return (s.replace('v1.0.6', 'v1.0.7')
             .replace('1,0,6,0', '1,0,7,0')
             .replace('1.0.6', '1.0.7'))

for rel in UTF8_FILES + GBK_FILES:
    p = os.path.join(ROOT, rel)
    if not os.path.isfile(p):
        print('缺失:', rel)
        continue
    enc = 'gbk' if rel in GBK_FILES else 'utf-8'
    s = io.open(p, encoding=enc).read()
    n = s.count('1.0.6') + s.count('1,0,6,0')
    s2 = bump(s)
    io.open(p, 'w', encoding=enc, newline='').write(s2)
    print('%s: 替换 %d 处 (%s)' % (rel, n, enc))

# 额外：data.js 文件头注释的更新时间
p = os.path.join(ROOT, 'data.js')
s = io.open(p, encoding='utf-8').read()
s2 = s.replace('// 更新时间：2026-10-24', '// 更新时间：2026-11-08', 1)
if s2 != s:
    io.open(p, 'w', encoding='utf-8', newline='').write(s2)
    print('data.js 头部注释更新时间 -> 2026-11-08')

# 额外：build_offline.js 里的示例文件名（写死的旧版本）
p = os.path.join(ROOT, 'build_offline.js')
s = io.open(p, encoding='utf-8').read()
s2 = s.replace('蚂蚁哥医保查询离线版v1.0.5.html', '蚂蚁哥医保查询离线版v1.0.7.html')
if s2 != s:
    io.open(p, 'w', encoding='utf-8', newline='').write(s2)
    print('build_offline.js 示例文件名 -> v1.0.7')

# 额外：README 版本记录追加
p = os.path.join(ROOT, 'README.md')
s = io.open(p, encoding='utf-8').read()
if 'v1.0.7' not in s:
    s = s.rstrip('\n') + '\nv1.0.7（2026年11月8日 更新热线口径、补齐惠民保数据）\n'
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('README.md 追加 v1.0.7 版本记录')
