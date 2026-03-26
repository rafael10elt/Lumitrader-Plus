Set shell = CreateObject("WScript.Shell")
scriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\run_mt5_reporter.bat"
shell.Run Chr(34) & scriptPath & Chr(34), 0, False
