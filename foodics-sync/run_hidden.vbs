Set WshShell = CreateObject(WScript.Shell)
scriptDir = CreateObject(Scripting.FileSystemObject).GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run cmd.exe /c run-foodics-sync.bat", 0, False
