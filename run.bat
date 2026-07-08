@echo off
cd /d D:\00_Vibe-Coding\11_Month_inout
python main.py >> logs\run_%date:~0,4%%date:~5,2%%date:~8,2%.log 2>&1
