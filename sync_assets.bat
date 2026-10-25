@echo off
chcp 936 >nul
rem 用途：网页版数据更新后，把最新资源同步进 Rust 单文件版的 assets 目录
rem 用法：在本目录双击运行；完成后进入 yibao-exe 执行 cargo build --release
cd /d "%~dp0"
if not exist "yibao-exe\assets\icon" mkdir "yibao-exe\assets\icon"
for %%f in (index.html app.js style.css data.json data.js universities.js aliases.js uni_fee.js) do copy /y "%%f" "yibao-exe\assets\%%f" >nul
copy /y "icon\icon_32.png" "yibao-exe\assets\icon\icon_32.png" >nul
copy /y "icon\icon_180.png" "yibao-exe\assets\icon\icon_180.png" >nul
echo [完成] 最新资源已同步到 yibao-exe\assets
echo 下一步：进入 yibao-exe 目录，执行 cargo build --release
echo 构建完成后，把 target\release\yibao.exe 拷出并改名为带版本号的名字即可分发
pause
