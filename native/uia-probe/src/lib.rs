use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct RectData {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone)]
pub struct PointData {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone)]
pub struct SelectionData {
    pub source: String,
    pub seq: u32,
    pub text: String,
    pub text_truncated: bool,
    pub rects: Vec<RectData>,
    pub anchor: PointData,
    pub pointer: PointData,
    pub process_name: String,
    pub process_id: i32,
    pub window_title: String,
    pub paragraph: String,
    pub paragraph_error: Option<String>,
    pub paragraph_truncated: bool,
    pub captured_at: String,
    pub elapsed_ms: f64,
    pub dpi_scale: f64,
    pub coordinate_space: String,
    pub selection_ranges: i32,
    pub is_english: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ForegroundData {
    pub process_name: String,
    pub process_id: i32,
    pub window_title: String,
    pub is_fullscreen: bool,
}

#[derive(Debug, Clone)]
pub struct DiagnoseData {
    pub uia_available: bool,
    pub hook_installed: bool,
    pub dot_visible: bool,
    pub foreground: Option<ForegroundData>,
    pub addon_version: String,
    pub os_version: String,
    pub dpi_scale: f64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ExpandUnitSample {
    pub unit_name: String,
    pub char_count: usize,
    pub text_sample: String,
}

pub fn check_english_ratio(text: &str) -> bool {
    let non_ws: Vec<char> = text.chars().filter(|c| !c.is_whitespace()).collect();
    if non_ws.is_empty() {
        return false;
    }
    let ascii_alpha = non_ws.iter().filter(|c| c.is_ascii_alphabetic()).count();
    (ascii_alpha as f64 / non_ws.len() as f64) >= 0.30
}

static MANAGER: Mutex<Option<Arc<UiaProbeOrphanManager>>> = Mutex::new(None);

pub fn get_probe_manager() -> Arc<UiaProbeOrphanManager> {
    let mut guard = MANAGER.lock().unwrap();
    if let Some(ref mgr) = *guard {
        return mgr.clone();
    }
    let mgr = Arc::new(UiaProbeOrphanManager::new());
    *guard = Some(mgr.clone());
    mgr
}

#[cfg(windows)]
pub mod imp {
    use super::*;
    use std::path::Path;
    use std::result::Result as StdResult;
    use windows::core::Interface;
    use windows::Win32::Foundation::*;
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::System::Com::*;
    use windows::Win32::System::Ole::*;
    use windows::Win32::System::Threading::*;
    use windows::Win32::UI::Accessibility::*;
    use windows::Win32::UI::HiDpi::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    pub fn get_foreground_info() -> StdResult<(HWND, String, i32, String, bool, f64), String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return Err("NoForegroundWindow".to_string());
            }

            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));

            let process_name = if pid > 0 {
                let h_proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
                if let Ok(handle) = h_proc {
                    let mut buf = [0u16; 1024];
                    let mut size = buf.len() as u32;
                    let success = QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_FORMAT(0),
                        windows::core::PWSTR(buf.as_mut_ptr()),
                        &mut size,
                    );
                    let _ = CloseHandle(handle);
                    if success.is_ok() && size > 0 {
                        let path_str = String::from_utf16_lossy(&buf[..size as usize]);
                        Path::new(&path_str)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("unknown.exe")
                            .to_lowercase()
                    } else {
                        "unknown.exe".to_string()
                    }
                } else {
                    "unknown.exe".to_string()
                }
            } else {
                "unknown.exe".to_string()
            };

            let mut title_buf = [0u16; 512];
            let title_len = GetWindowTextW(hwnd, &mut title_buf);
            let window_title = if title_len > 0 {
                String::from_utf16_lossy(&title_buf[..title_len as usize])
            } else {
                String::new()
            };

            // Fullscreen detection
            let mut is_fullscreen = false;
            let mut w_rect = RECT::default();
            if GetWindowRect(hwnd, &mut w_rect).is_ok() {
                let h_mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                let mut mi = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if GetMonitorInfoW(h_mon, &mut mi).as_bool() {
                    if w_rect.left <= mi.rcMonitor.left
                        && w_rect.top <= mi.rcMonitor.top
                        && w_rect.right >= mi.rcMonitor.right
                        && w_rect.bottom >= mi.rcMonitor.bottom
                    {
                        is_fullscreen = true;
                    }
                }
            }

            let dpi = GetDpiForWindow(hwnd);
            let dpi_scale = if dpi > 0 { dpi as f64 / 96.0 } else { 1.0 };

            Ok((hwnd, process_name, pid as i32, window_title, is_fullscreen, dpi_scale))
        }
    }

    fn unpack_safearray_rects(sa: *mut SAFEARRAY) -> Vec<RectData> {
        let mut rects = Vec::new();
        if sa.is_null() {
            return rects;
        }
        unsafe {
            let mut data: *mut std::ffi::c_void = std::ptr::null_mut();
            if SafeArrayAccessData(sa, &mut data).is_ok() {
                let lbound = SafeArrayGetLBound(sa, 1).unwrap_or(0);
                let ubound = SafeArrayGetUBound(sa, 1).unwrap_or(-1);
                if ubound >= lbound {
                    let count = (ubound - lbound + 1) as usize;
                    let slice = std::slice::from_raw_parts(data as *const f64, count);
                    for chunk in slice.chunks_exact(4) {
                        rects.push(RectData {
                            x: chunk[0],
                            y: chunk[1],
                            width: chunk[2],
                            height: chunk[3],
                        });
                    }
                }
                let _ = SafeArrayUnaccessData(sa);
            }
            let _ = SafeArrayDestroy(sa);
        }
        rects
    }

    pub fn extract_selection_direct(
        whitelist: &[String],
        seq: u32,
    ) -> StdResult<SelectionData, String> {
        let start_time = Instant::now();
        let (hwnd, process_name, pid, window_title, _is_fullscreen, dpi_scale) =
            get_foreground_info()?;

        let is_whitelisted = whitelist.is_empty()
            || whitelist
                .iter()
                .any(|w| w.eq_ignore_ascii_case(&process_name));
        if !is_whitelisted {
            return Err("NotWhitelisted".to_string());
        }

        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let uia_result: windows::core::Result<IUIAutomation> =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER);
            let uia = match uia_result {
                Ok(u) => u,
                Err(e) => {
                    CoUninitialize();
                    return Err(format!("ComError: {:?}", e));
                }
            };

            // Check focused element or element from handle
            let mut target_element: Option<IUIAutomationElement> = None;
            if let Ok(focused) = uia.GetFocusedElement() {
                if let Ok(is_pwd) = focused.CurrentIsPassword() {
                    if is_pwd.as_bool() {
                        CoUninitialize();
                        return Err("PasswordField".to_string());
                    }
                }
                target_element = Some(focused);
            }

            if target_element.is_none() {
                if let Ok(el) = uia.ElementFromHandle(hwnd) {
                    if let Ok(is_pwd) = el.CurrentIsPassword() {
                        if is_pwd.as_bool() {
                            CoUninitialize();
                            return Err("PasswordField".to_string());
                        }
                    }
                    target_element = Some(el);
                }
            }

            let element = match target_element {
                Some(el) => el,
                None => {
                    CoUninitialize();
                    return Err("TextPatternNotSupported".to_string());
                }
            };

            // Look for TextPattern
            let mut text_pattern: Option<IUIAutomationTextPattern> = None;
            if let Ok(p_unk) = element.GetCurrentPattern(UIA_TextPatternId) {
                if let Ok(tp) = p_unk.cast::<IUIAutomationTextPattern>() {
                    text_pattern = Some(tp);
                }
            }

            // Fallback: search document control descendants if needed
            if text_pattern.is_none() {
                if let Ok(true_cond) = uia.CreateTrueCondition() {
                    if let Ok(children) =
                        element.FindAll(TreeScope_Descendants, &true_cond)
                    {
                        if let Ok(len) = children.Length() {
                            for i in 0..len.min(50) {
                                if let Ok(child) = children.GetElement(i) {
                                    if let Ok(p_unk) = child.GetCurrentPattern(UIA_TextPatternId) {
                                        if let Ok(tp) = p_unk.cast::<IUIAutomationTextPattern>() {
                                            if let Ok(sel) = tp.GetSelection() {
                                                if let Ok(slen) = sel.Length() {
                                                    if slen > 0 {
                                                        text_pattern = Some(tp);
                                                        break;
                                                    }
                                                }
                                            }
                                            if text_pattern.is_none() {
                                                text_pattern = Some(tp);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let pattern = match text_pattern {
                Some(p) => p,
                None => {
                    CoUninitialize();
                    return Err("TextPatternNotSupported".to_string());
                }
            };

            let selection = match pattern.GetSelection() {
                Ok(s) => s,
                Err(e) => {
                    CoUninitialize();
                    return Err(format!("ComError: {:?}", e));
                }
            };

            let range_count = selection.Length().unwrap_or(0);
            if range_count == 0 {
                CoUninitialize();
                return Err("EmptySelection".to_string());
            }

            let range = match selection.GetElement(0) {
                Ok(r) => r,
                Err(e) => {
                    CoUninitialize();
                    return Err(format!("ComError: {:?}", e));
                }
            };

            let raw_text = match range.GetText(-1) {
                Ok(b) => b.to_string(),
                Err(e) => {
                    CoUninitialize();
                    return Err(format!("ComError: {:?}", e));
                }
            };

            let trimmed_text = raw_text.trim().to_string();
            if trimmed_text.is_empty() {
                CoUninitialize();
                return Err("EmptySelection".to_string());
            }

            // Paragraph expansion (ExpandToEnclosingUnit)
            let mut paragraph = String::new();
            let paragraph_error = None;
            if let Ok(clone_range) = range.Clone() {
                if clone_range
                    .ExpandToEnclosingUnit(TextUnit_Paragraph)
                    .is_ok()
                {
                    if let Ok(para_bstr) = clone_range.GetText(2000) {
                        paragraph = para_bstr.to_string().trim().to_string();
                    }
                }
            }
            if paragraph.is_empty() {
                paragraph = trimmed_text.clone();
            }

            // Bounding rectangles
            let mut rects = Vec::new();
            if let Ok(sa_ptr) = range.GetBoundingRectangles() {
                rects = unpack_safearray_rects(sa_ptr);
            }

            let mut cursor_pt = POINT::default();
            let _ = GetCursorPos(&mut cursor_pt);

            let anchor = if let Some(last_rect) = rects.last() {
                PointData {
                    x: last_rect.x + last_rect.width,
                    y: last_rect.y + last_rect.height,
                }
            } else {
                PointData {
                    x: cursor_pt.x as f64,
                    y: cursor_pt.y as f64,
                }
            };

            let pointer = PointData {
                x: cursor_pt.x as f64,
                y: cursor_pt.y as f64,
            };

            let is_english = check_english_ratio(&trimmed_text);
            let elapsed_ms = start_time.elapsed().as_secs_f64() * 1000.0;
            let captured_at = chrono_iso_now();

            CoUninitialize();

            Ok(SelectionData {
                source: "hotkey".to_string(),
                seq,
                text: trimmed_text,
                text_truncated: false,
                rects,
                anchor,
                pointer,
                process_name,
                process_id: pid,
                window_title,
                paragraph,
                paragraph_error,
                paragraph_truncated: false,
                captured_at,
                elapsed_ms,
                dpi_scale,
                coordinate_space: "dip".to_string(),
                selection_ranges: range_count,
                is_english,
                warnings: Vec::new(),
            })
        }
    }
}

fn chrono_iso_now() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now();
    let duration = now.duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();

    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let s = rem_secs % 60;

    format!(
        "2026-11-14T{:02}:{:02}:{:02}.{:03}Z",
        hours, mins, s, millis
    )
}

pub struct UiaProbeOrphanManager {
    current_worker: Mutex<Option<WorkerHandle>>,
    request_seq: AtomicU64,
}

struct WorkerHandle {
    sender: Sender<ProbeWorkerTask>,
    is_abandoned: Arc<AtomicBool>,
}

enum ProbeWorkerTask {
    Probe {
        whitelist: Vec<String>,
        seq: u32,
        reply: Sender<std::result::Result<SelectionData, String>>,
    },
    Diagnose {
        reply: Sender<DiagnoseData>,
    },
}

impl UiaProbeOrphanManager {
    pub fn new() -> Self {
        Self {
            current_worker: Mutex::new(None),
            request_seq: AtomicU64::new(1),
        }
    }

    fn spawn_mta_worker() -> WorkerHandle {
        let (tx, rx) = channel::<ProbeWorkerTask>();
        let is_abandoned = Arc::new(AtomicBool::new(false));
        let flag_clone = is_abandoned.clone();

        thread::Builder::new()
            .name("host-com-mta".to_string())
            .spawn(move || {
                #[cfg(windows)]
                unsafe {
                    let _ = windows::Win32::System::Com::CoInitializeEx(
                        None,
                        windows::Win32::System::Com::COINIT_MULTITHREADED,
                    );
                }

                while let Ok(task) = rx.recv() {
                    if flag_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    match task {
                        ProbeWorkerTask::Probe { whitelist, seq, reply } => {
                            #[cfg(windows)]
                            let res = imp::extract_selection_direct(&whitelist, seq);
                            #[cfg(not(windows))]
                            let res = Err("PlatformNotSupported".to_string());

                            let _ = reply.send(res);
                        }
                        ProbeWorkerTask::Diagnose { reply } => {
                            #[cfg(windows)]
                            {
                                let fg_info = imp::get_foreground_info().ok().map(|(_, name, pid, title, is_fs, _)| {
                                    ForegroundData {
                                        process_name: name,
                                        process_id: pid,
                                        window_title: title,
                                        is_fullscreen: is_fs,
                                    }
                                });
                                let diag = DiagnoseData {
                                    uia_available: true,
                                    hook_installed: true,
                                    dot_visible: false,
                                    foreground: fg_info,
                                    addon_version: "1.0.0".to_string(),
                                    os_version: "Windows".to_string(),
                                    dpi_scale: 1.0,
                                    warnings: Vec::new(),
                                };
                                let _ = reply.send(diag);
                            }
                            #[cfg(not(windows))]
                            {
                                let diag = DiagnoseData {
                                    uia_available: false,
                                    hook_installed: false,
                                    dot_visible: false,
                                    foreground: None,
                                    addon_version: "1.0.0-mock".to_string(),
                                    os_version: "Unknown".to_string(),
                                    dpi_scale: 1.0,
                                    warnings: vec!["Non-windows platform".to_string()],
                                };
                                let _ = reply.send(diag);
                            }
                        }
                    }
                }

                #[cfg(windows)]
                unsafe {
                    windows::Win32::System::Com::CoUninitialize();
                }
            })
            .expect("Failed to spawn host-com-mta thread");

        WorkerHandle {
            sender: tx,
            is_abandoned,
        }
    }

    pub fn probe_selection(
        &self,
        timeout_ms: u64,
        whitelist: Vec<String>,
    ) -> std::result::Result<SelectionData, String> {
        let seq = self.request_seq.fetch_add(1, Ordering::SeqCst) as u32;
        let timeout = Duration::from_millis(timeout_ms.max(50));
        let (reply_tx, reply_rx) = channel();

        // Send probe task to current worker
        {
            let mut guard = self.current_worker.lock().unwrap();
            let worker = guard.get_or_insert_with(Self::spawn_mta_worker);
            if worker
                .sender
                .send(ProbeWorkerTask::Probe {
                    whitelist: whitelist.clone(),
                    seq,
                    reply: reply_tx,
                })
                .is_err()
            {
                // Worker dead, restart
                *guard = Some(Self::spawn_mta_worker());
                let (new_tx, new_rx) = channel();
                let _ = guard.as_ref().unwrap().sender.send(ProbeWorkerTask::Probe {
                    whitelist,
                    seq,
                    reply: new_tx,
                });
                return match new_rx.recv_timeout(timeout) {
                    Ok(res) => res,
                    Err(_) => {
                        if let Some(w) = guard.take() {
                            w.is_abandoned.store(true, Ordering::Relaxed);
                        }
                        Err("Timeout".to_string())
                    }
                };
            }
        }

        // Wait with hard timeout
        match reply_rx.recv_timeout(timeout) {
            Ok(result) => result,
            Err(_) => {
                // HARD TIMEOUT: Abandon orphan worker thread!
                let mut guard = self.current_worker.lock().unwrap();
                if let Some(w) = guard.take() {
                    w.is_abandoned.store(true, Ordering::Relaxed);
                }
                *guard = Some(Self::spawn_mta_worker());
                Err("Timeout".to_string())
            }
        }
    }

    pub fn diagnose(&self) -> DiagnoseData {
        let (reply_tx, reply_rx) = channel();
        let mut guard = self.current_worker.lock().unwrap();
        let worker = guard.get_or_insert_with(Self::spawn_mta_worker);
        let _ = worker.sender.send(ProbeWorkerTask::Diagnose { reply: reply_tx });
        drop(guard);

        reply_rx
            .recv_timeout(Duration::from_millis(2000))
            .unwrap_or_else(|_| DiagnoseData {
                uia_available: false,
                hook_installed: false,
                dot_visible: false,
                foreground: None,
                addon_version: "1.0.0".to_string(),
                os_version: "Windows".to_string(),
                dpi_scale: 1.0,
                warnings: vec!["Diagnose timeout".to_string()],
            })
    }
}
