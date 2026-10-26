Option Explicit
Dim fso, shell, base, dist, folder, file, exe, electron

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
exe = ""

dist = base & "\dist"
If fso.FolderExists(dist) Then
  For Each folder In fso.GetFolder(dist).SubFolders
    For Each file In folder.Files
      If LCase(fso.GetExtensionName(file.Name)) = "exe" Then
        If LCase(fso.GetBaseName(file.Name)) <> "electron" Then
          exe = file.Path
          Exit For
        End If
      End If
    Next
    If exe <> "" Then Exit For
  Next
End If

If exe <> "" Then
  shell.Run """" & exe & """", 1, False
Else
  electron = base & "\node_modules\electron\dist\electron.exe"
  If fso.FileExists(electron) Then
    shell.CurrentDirectory = base
    shell.Run "cmd /c npm start", 0, False
  Else
    MsgBox "Naiwa Pet was not found." & vbCrLf & vbCrLf & _
           "Please use the packaged exe under the dist folder," & vbCrLf & _
           "or run: npm install; npm run pack", 48, "Naiwa Desktop Pet"
  End If
End If
