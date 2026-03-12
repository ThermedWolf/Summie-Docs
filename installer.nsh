; Custom NSIS script for Summie
; Handles: Update / Repair / Uninstall when an existing version is detected.
;
; electron-builder registers the uninstall key under the appId: com.summie.app
; The macro customInit runs at NSIS startup (before installer UI).
; We detect an existing install here, store the path, and handle it in customInstall.

!include "LogicLib.nsh"
!include "MUI2.nsh"

!macro customHeader
!macroend

; ── Globals ──────────────────────────────────────────────────────────────────
; $R0 = existing install path (empty = fresh install)
; $R1 = primary language code (low byte of GetUserDefaultUILanguage)
; $R2 = user choice: "update" | "repair" | "uninstall" | "" (fresh)

; ── Detect existing install at NSIS startup ───────────────────────────────────
!macro customInit
  ; electron-builder writes the uninstall key under the appId
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.summie.app" "InstallLocation"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.summie.app" "InstallLocation"
  ${EndIf}
  ; Fallback: also check under productName in case an older build used that
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Summie" "InstallLocation"
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Summie" "InstallLocation"
  ${EndIf}

  ; Detect UI language (low byte)
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r1'
  IntOp $R1 $1 & 0xFF

  ; Store "fresh" as default choice — customInstall will read this
  StrCpy $R2 ""
!macroend

!macro customInstallMode
!macroend

; ── Post-install: run update/repair/uninstall dialog if needed ────────────────
!macro customInstall

  ; === Existing-install dialog ===
  ${If} $R0 != ""

    ; ---- Localised strings ----
    StrCpy $3 "Summie is already installed.$\r$\nWould you like to update to the new version?"
    StrCpy $4 "Would you like to repair Summie instead?$\r$\n(Restores shortcuts and file associations)"
    StrCpy $5 "Would you like to completely uninstall Summie?"
    StrCpy $6 "Summie has been uninstalled."
    StrCpy $7 "Summie has been repaired. Shortcuts and file associations have been restored."

    ${If} $R1 = 0x13         ; Dutch
      StrCpy $3 "Summie is al geinstalleerd.$\r$\nWil je bijwerken naar de nieuwe versie?"
      StrCpy $4 "Wil je Summie repareren?$\r$\n(Herstelt snelkoppelingen en bestandskoppelingen)"
      StrCpy $5 "Wil je Summie volledig verwijderen?"
      StrCpy $6 "Summie is verwijderd."
      StrCpy $7 "Summie is gerepareerd. Snelkoppelingen en bestandskoppelingen zijn hersteld."
    ${ElseIf} $R1 = 0x07     ; German
      StrCpy $3 "Summie ist bereits installiert.$\r$\nMoechten Sie auf die neue Version aktualisieren?"
      StrCpy $4 "Moechten Sie Summie reparieren?$\r$\n(Stellt Verknuepfungen und Dateizuordnungen wieder her)"
      StrCpy $5 "Moechten Sie Summie vollstaendig deinstallieren?"
      StrCpy $6 "Summie wurde deinstalliert."
      StrCpy $7 "Summie wurde repariert."
    ${ElseIf} $R1 = 0x0C     ; French
      StrCpy $3 "Summie est deja installe.$\r$\nVoulez-vous mettre a jour vers la nouvelle version?"
      StrCpy $4 "Voulez-vous reparer Summie?$\r$\n(Restaure les raccourcis et associations de fichiers)"
      StrCpy $5 "Voulez-vous desinstaller completement Summie?"
      StrCpy $6 "Summie a ete desinstalle."
      StrCpy $7 "Summie a ete repare."
    ${ElseIf} $R1 = 0x0A     ; Spanish
      StrCpy $3 "Summie ya esta instalado.$\r$\nDeseas actualizar a la nueva version?"
      StrCpy $4 "Deseas reparar Summie?$\r$\n(Restaura accesos directos y asociaciones de archivos)"
      StrCpy $5 "Deseas desinstalar Summie completamente?"
      StrCpy $6 "Summie ha sido desinstalado."
      StrCpy $7 "Summie ha sido reparado."
    ${EndIf}

    ; ---- Dialog 1: Update? ----
    MessageBox MB_YESNO|MB_ICONQUESTION "$3" /SD IDYES IDYES do_update IDNO ask_repair

    ; ---- Dialog 2: Repair? ----
    ask_repair:
      MessageBox MB_YESNO|MB_ICONQUESTION "$4" /SD IDNO IDYES do_repair IDNO ask_uninstall

    ; ---- Dialog 3: Uninstall? ----
    ask_uninstall:
      MessageBox MB_YESNO|MB_ICONQUESTION "$5" /SD IDNO IDYES do_uninstall IDNO do_cancel

    do_cancel:
      Quit

    ; ---- UPDATE: silent-uninstall old version, then let installer continue ----
    do_update:
      IfFileExists "$R0\Uninstall Summie.exe" 0 update_done
        ExecWait '"$R0\Uninstall Summie.exe" /S _?=$R0'
      update_done:
      Goto install_done   ; fall through to normal install

    ; ---- UNINSTALL only ----
    do_uninstall:
      IfFileExists "$R0\Uninstall Summie.exe" 0 uninstall_done
        ExecWait '"$R0\Uninstall Summie.exe" /S _?=$R0'
      uninstall_done:
      MessageBox MB_OK|MB_ICONINFORMATION "$6"
      Quit

    ; ---- REPAIR: recreate shortcuts + file associations ----
    do_repair:
      Delete "$DESKTOP\Summie.lnk"
      Delete "$SMPROGRAMS\Summie\Summie.lnk"
      CreateShortcut "$DESKTOP\Summie.lnk" "$R0\Summie.exe"
      CreateDirectory "$SMPROGRAMS\Summie"
      CreateShortcut "$SMPROGRAMS\Summie\Summie.lnk" "$R0\Summie.exe"
      WriteRegStr HKCU "Software\Classes\.sumd"                              "" "SummieDocument"
      WriteRegStr HKCU "Software\Classes\SummieDocument"                    "" "Summie Document"
      WriteRegStr HKCU "Software\Classes\SummieDocument\DefaultIcon"        "" "$R0\Summie.exe,0"
      WriteRegStr HKCU "Software\Classes\SummieDocument\shell\open\command" "" '"$R0\Summie.exe" "%1"'
      MessageBox MB_OK|MB_ICONINFORMATION "$7"
      Quit

    install_done:
  ${EndIf}

  ; === Desktop shortcut offer (fresh install or after update) ===
  StrCpy $3 "Would you like to create a desktop shortcut?"
  StrCpy $4 "Would you like to pin Summie to the taskbar?"

  ${If} $R1 = 0x13
    StrCpy $3 "Wil je een snelkoppeling op het bureaublad aanmaken?"
    StrCpy $4 "Wil je Summie vastmaken aan de taakbalk?"
  ${ElseIf} $R1 = 0x07
    StrCpy $3 "Moechten Sie eine Desktop-Verknuepfung erstellen?"
    StrCpy $4 "Moechten Sie Summie an die Taskleiste anheften?"
  ${ElseIf} $R1 = 0x0C
    StrCpy $3 "Voulez-vous creer un raccourci sur le bureau?"
    StrCpy $4 "Voulez-vous epingler Summie a la barre des taches?"
  ${ElseIf} $R1 = 0x0A
    StrCpy $3 "Deseas crear un acceso directo en el escritorio?"
    StrCpy $4 "Deseas anclar Summie a la barra de tareas?"
  ${EndIf}

  MessageBox MB_YESNO|MB_ICONQUESTION "$3" /SD IDNO IDYES create_desktop IDNO skip_desktop
  create_desktop:
    CreateShortcut "$DESKTOP\Summie.lnk" "$INSTDIR\Summie.exe"
  skip_desktop:

  MessageBox MB_YESNO|MB_ICONQUESTION "$4" /SD IDNO IDYES pin_taskbar IDNO skip_taskbar
  pin_taskbar:
    FileOpen $0 "$TEMP\pin_summie.vbs" w
    FileWrite $0 'Set oShell = CreateObject("Shell.Application")$\r$\n'
    FileWrite $0 'Set oFolder = oShell.Namespace("$INSTDIR")$\r$\n'
    FileWrite $0 'Set oFolderItem = oFolder.ParseName("Summie.exe")$\r$\n'
    FileWrite $0 'For Each oVerb in oFolderItem.Verbs$\r$\n'
    FileWrite $0 '  If InStr(oVerb.Name, "taskbar") > 0 Or InStr(oVerb.Name, "Taskbar") > 0 Or InStr(oVerb.Name, "taakbalk") > 0 Then$\r$\n'
    FileWrite $0 '    oVerb.DoIt$\r$\n'
    FileWrite $0 '  End If$\r$\n'
    FileWrite $0 'Next$\r$\n'
    FileClose $0
    ExecWait '"wscript.exe" "$TEMP\pin_summie.vbs"'
    Delete "$TEMP\pin_summie.vbs"
  skip_taskbar:
!macroend

; ── Uninstall cleanup ─────────────────────────────────────────────────────────
!macro customUnInstall
  Delete "$DESKTOP\Summie.lnk"
  Delete "$SMPROGRAMS\Summie.lnk"
  Delete "$SMPROGRAMS\Summie\Summie.lnk"
  RMDir "$SMPROGRAMS\Summie"
  DeleteRegKey HKCU "Software\Classes\.sumd"
  DeleteRegKey HKCU "Software\Classes\SummieDocument"
!macroend