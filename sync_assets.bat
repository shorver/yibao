@echo off
chcp 936 >nul
rem ��;����ҳ�����ݸ��º󣬰�������Դͬ���� Rust ���ļ���� assets Ŀ¼
rem �÷����ڱ�Ŀ¼˫�����У���ɺ���� yibao-exe ִ�� cargo build --release
cd /d "%~dp0"
if not exist "yibao-exe\assets\icon" mkdir "yibao-exe\assets\icon"
for %%f in (index.html app.js style.css data.json data.js universities.js aliases.js uni_fee.js) do copy /y "%%f" "yibao-exe\assets\%%f" >nul
copy /y "icon\icon_32.png" "yibao-exe\assets\icon\icon_32.png" >nul
copy /y "icon\icon_180.png" "yibao-exe\assets\icon\icon_180.png" >nul
copy /y "icon\icon_256.png" "yibao-exe\assets\icon\icon_256.png" >nul
echo [���] ������Դ��ͬ���� yibao-exe\assets
echo ��һ�������� yibao-exe Ŀ¼��ִ�� cargo build --release
echo ������ɺ󣬰� target\release\yibao.exe ����������Ϊ���汾�ŵ����ּ��ɷַ�
pause
