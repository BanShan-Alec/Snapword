!ifdef BUILD_UNINSTALLER
  !include nsDialogs.nsh

  Var unAppDataDialog
  Var unAppDataLabel
  Var unAppDataCheckbox
  Var unDeleteAppData
  Var unTextTitle
  Var unTextSubtitle
  Var unTextDescription
  Var unTextCheckbox

  !macro customUnInit
    StrCpy $unDeleteAppData "0"
  !macroend

  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME

    Function un.AppDataOptionsCreate
      ; 静默卸载或 OTA 自动更新流程跳过交互页，确保不会误删用户数据
      ${If} ${Silent}
      ${OrIf} ${isUpdated}
        StrCpy $unDeleteAppData "0"
        Abort
      ${EndIf}

      ; 根据 $LANGUAGE 运行时选择文案，避免因缺少全部 ~40 种捆绑语言的 LangString 触发 NSIS warning 6040
      ${If} $LANGUAGE == 2052
        StrCpy $unTextTitle "卸载选项"
        StrCpy $unTextSubtitle "选择是否同时清除本地应用数据。"
        StrCpy $unTextDescription "您可以保留配置与本地数据以便日后重装使用，或勾选下方选项彻底清除 ${PRODUCT_NAME} 的本地应用数据。"
        StrCpy $unTextCheckbox "同时清除本地应用数据、配置与缓存（AppData）"
      ${ElseIf} $LANGUAGE == 1028
      ${OrIf} $LANGUAGE == 3076
        StrCpy $unTextTitle "解除安裝選項"
        StrCpy $unTextSubtitle "選擇是否同時清除本機應用程式資料。"
        StrCpy $unTextDescription "您可以保留設定與本機資料以便日後重新安裝使用，或勾選下方選項徹底清除 ${PRODUCT_NAME} 的本機應用程式資料。"
        StrCpy $unTextCheckbox "同時清除本機應用程式資料、設定與快取（AppData）"
      ${Else}
        StrCpy $unTextTitle "Uninstall Options"
        StrCpy $unTextSubtitle "Choose whether to remove local application data."
        StrCpy $unTextDescription "You can keep your settings and local data for future reinstallation, or check the option below to delete all local data associated with ${PRODUCT_NAME}."
        StrCpy $unTextCheckbox "Also remove local application data, settings, and cache (AppData)"
      ${EndIf}

      !insertmacro MUI_HEADER_TEXT "$unTextTitle" "$unTextSubtitle"

      nsDialogs::Create 1018
      Pop $unAppDataDialog
      ${If} $unAppDataDialog == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0u 0u 100% 28u "$unTextDescription"
      Pop $unAppDataLabel

      ${NSD_CreateCheckbox} 0u 36u 100% 14u "$unTextCheckbox"
      Pop $unAppDataCheckbox
      ${If} $unDeleteAppData == "1"
        ${NSD_SetState} $unAppDataCheckbox ${BST_CHECKED}
      ${Else}
        ${NSD_SetState} $unAppDataCheckbox ${BST_UNCHECKED}
      ${EndIf}

      nsDialogs::Show
    FunctionEnd

    Function un.AppDataOptionsLeave
      ${NSD_GetState} $unAppDataCheckbox $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $unDeleteAppData "1"
      ${Else}
        StrCpy $unDeleteAppData "0"
      ${EndIf}
    FunctionEnd

    UninstPage custom un.AppDataOptionsCreate un.AppDataOptionsLeave
  !macroend

  !macro customUnInstall
    ; 仅在非静默、非 OTA 更新且用户显式勾选时清理本地 AppData 与 updater 缓存
    ${If} $unDeleteAppData == "1"
    ${AndIfNot} ${isUpdated}
    ${AndIfNot} ${Silent}
      ${If} $installMode == "all"
        SetShellVarContext current
      ${EndIf}

      RMDir /r "$APPDATA\${APP_FILENAME}"
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
        RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
      !endif

      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
    ${EndIf}
  !macroend
!endif
