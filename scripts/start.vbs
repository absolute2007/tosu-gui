Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = fso.GetParentFolderName(root)
shell.Run "node """ & root & "\start.js""", 0, False