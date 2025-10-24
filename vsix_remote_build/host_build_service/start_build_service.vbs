Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "python build_service.py", 0, False
Set WshShell = Nothing
