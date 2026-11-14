use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use uia_probe::{PointData, RectData, SelectionData};

#[derive(Debug, Clone)]
pub enum DotEvent {
    Clicked(SelectionData),
    Hidden { seq: u32, reason: String },
    ForegroundChanged {
        process_name: String,
        process_id: i32,
        window_title: String,
        is_fullscreen: bool,
    },
}

pub type DotEventCallback = Box<dyn Fn(DotEvent) + Send + Sync + 'static>;

pub struct DotWindowManager {
    is_running: Arc<AtomicBool>,
    dot_visible: Arc<AtomicBool>,
    last_click_time: Arc<Mutex<Instant>>,
    current_selection: Arc<Mutex<Option<SelectionData>>>,
    event_callback: Arc<Mutex<Option<DotEventCallback>>>,
    hwnd_holder: Arc<AtomicU64>,
}

static DOT_MGR: Mutex<Option<Arc<DotWindowManager>>> = Mutex::new(None);

pub fn get_dot_manager() -> Arc<DotWindowManager> {
    let mut guard = DOT_MGR.lock().unwrap();
    if let Some(ref mgr) = *guard {
        return mgr.clone();
    }
    let mgr = Arc::new(DotWindowManager::new());
    *guard = Some(mgr.clone());
    mgr
}

impl DotWindowManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            dot_visible: Arc::new(AtomicBool::new(false)),
            last_click_time: Arc::new(Mutex::new(Instant::now() - Duration::from_secs(10))),
            current_selection: Arc::new(Mutex::new(None)),
            event_callback: Arc::new(Mutex::new(None)),
            hwnd_holder: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn set_callback(&self, cb: DotEventCallback) {
        let mut guard = self.event_callback.lock().unwrap();
        *guard = Some(cb);
    }

    pub fn is_visible(&self) -> bool {
        self.dot_visible.load(Ordering::Relaxed)
    }

    pub fn start(&self) -> Result<(), String> {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Ok(()); // Already running
        }

        #[cfg(windows)]
        {
            let is_running = self.is_running.clone();
            let dot_visible = self.dot_visible.clone();
            let last_click = self.last_click_time.clone();
            let current_sel = self.current_selection.clone();
            let cb_holder = self.event_callback.clone();
            let hwnd_holder = self.hwnd_holder.clone();

            thread::Builder::new()
                .name("host-dot-win32".to_string())
                .spawn(move || {
                    imp::run_dot_window_loop(
                        is_running,
                        dot_visible,
                        last_click,
                        current_sel,
                        cb_holder,
                        hwnd_holder,
                    );
                })
                .map_err(|e| format!("Failed to spawn dot thread: {:?}", e))?;
        }

        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        self.hide("shutdown");
        #[cfg(windows)]
        {
            let hwnd_raw = self.hwnd_holder.load(Ordering::SeqCst);
            if hwnd_raw > 0 {
                unsafe {
                    let _ = windows::Win32::UI::WindowsAndMessaging::PostMessageW(
                        Some(windows::Win32::Foundation::HWND(hwnd_raw as *mut _)),
                        windows::Win32::UI::WindowsAndMessaging::WM_CLOSE,
                        windows::Win32::Foundation::WPARAM(0),
                        windows::Win32::Foundation::LPARAM(0),
                    );
                }
            }
        }
    }

    pub fn hide(&self, reason: &str) {
        if self.dot_visible.swap(false, Ordering::SeqCst) {
            #[cfg(windows)]
            {
                let hwnd_raw = self.hwnd_holder.load(Ordering::SeqCst);
                if hwnd_raw > 0 {
                    unsafe {
                        let _ = windows::Win32::UI::WindowsAndMessaging::ShowWindow(
                            windows::Win32::Foundation::HWND(hwnd_raw as *mut _),
                            windows::Win32::UI::WindowsAndMessaging::SW_HIDE,
                        );
                    }
                }
            }

            let seq = self
                .current_selection
                .lock()
                .unwrap()
                .as_ref()
                .map(|s| s.seq)
                .unwrap_or(0);

            let guard = self.event_callback.lock().unwrap();
            if let Some(ref cb) = *guard {
                cb(DotEvent::Hidden {
                    seq,
                    reason: reason.to_string(),
                });
            }
        }
    }
}

pub fn calculate_dot_position(
    selection_rect: &RectData,
    pointer: &PointData,
    screen_width: f64,
    screen_height: f64,
) -> (f64, f64) {
    let dot_w = 24.0;
    let dot_h = 24.0;
    let offset = 8.0;

    // RD-01 Flip Order:
    // 1. Selection bottom-right
    let x1 = selection_rect.x + selection_rect.width + offset;
    let y1 = selection_rect.y + selection_rect.height + offset;
    if x1 + dot_w <= screen_width && y1 + dot_h <= screen_height && x1 >= 0.0 && y1 >= 0.0 {
        return (x1, y1);
    }

    // 2. Selection top-left
    let x2 = selection_rect.x - dot_w - offset;
    let y2 = selection_rect.y - dot_h - offset;
    if x2 >= 0.0 && y2 >= 0.0 && x2 + dot_w <= screen_width && y2 + dot_h <= screen_height {
        return (x2, y2);
    }

    // 3. Selection right-center
    let x3 = selection_rect.x + selection_rect.width + offset;
    let y3 = selection_rect.y + (selection_rect.height - dot_h) / 2.0;
    if x3 + dot_w <= screen_width && y3 >= 0.0 && y3 + dot_h <= screen_height {
        return (x3, y3);
    }

    // 4. Mouse pointer bottom-right
    let x4 = pointer.x + offset;
    let y4 = pointer.y + offset;
    if x4 + dot_w <= screen_width && y4 + dot_h <= screen_height && x4 >= 0.0 && y4 >= 0.0 {
        return (x4, y4);
    }

    // 5. Screen center fallback
    (
        (screen_width - dot_w) / 2.0,
        (screen_height - dot_h) / 2.0,
    )
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::core::*;
    use windows::Win32::Foundation::*;
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::*;

    static mut HOOK_HANDLE: HHOOK = HHOOK(std::ptr::null_mut());
    static mut DOT_HWND: HWND = HWND(std::ptr::null_mut());

    const WM_DOT_MOUSE_UP: u32 = WM_USER + 101;
    const WM_DOT_MOUSE_DOWN: u32 = WM_USER + 102;
    const WM_DOT_MOUSE_WHEEL: u32 = WM_USER + 103;

    unsafe extern "system" fn low_level_mouse_proc(
        ncode: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if ncode >= 0 && !DOT_HWND.0.is_null() {
            let msg = wparam.0 as u32;
            if msg == WM_LBUTTONUP {
                let _ = PostMessageW(Some(DOT_HWND), WM_DOT_MOUSE_UP, WPARAM(0), LPARAM(0));
            } else if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN {
                let _ = PostMessageW(Some(DOT_HWND), WM_DOT_MOUSE_DOWN, WPARAM(0), LPARAM(0));
            } else if msg == WM_MOUSEWHEEL {
                let _ = PostMessageW(Some(DOT_HWND), WM_DOT_MOUSE_WHEEL, WPARAM(0), LPARAM(0));
            }
        }
        CallNextHookEx(Some(HOOK_HANDLE), ncode, wparam, lparam)
    }

    unsafe extern "system" fn dot_wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                let hdc = BeginPaint(hwnd, &mut ps);

                // Fill background with magenta color key RGB(255, 0, 255)
                let bg_brush = CreateSolidBrush(COLORREF(0x00FF00FF));
                let rect = RECT {
                    left: 0,
                    top: 0,
                    right: 24,
                    bottom: 24,
                };
                let _ = FillRect(hdc, &rect, bg_brush);
                let _ = DeleteObject(bg_brush.into());

                // Draw 10x10 circle in the center (from x:7, y:7 to x:17, y:17)
                // Border: 1px white
                let white_pen = CreatePen(PS_SOLID, 1, COLORREF(0x00FFFFFF));
                // Fill: brand blue #1677ff -> 0x00FF7716 in BGR
                let brand_brush = CreateSolidBrush(COLORREF(0x00FF7716));

                let old_pen = SelectObject(hdc, white_pen.into());
                let old_brush = SelectObject(hdc, brand_brush.into());

                let _ = Ellipse(hdc, 7, 7, 17, 17);

                let _ = SelectObject(hdc, old_pen);
                let _ = SelectObject(hdc, old_brush);
                let _ = DeleteObject(white_pen.into());
                let _ = DeleteObject(brand_brush.into());

                let _ = EndPaint(hwnd, &ps);
                LRESULT(0)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    pub fn run_dot_window_loop(
        is_running: Arc<AtomicBool>,
        dot_visible: Arc<AtomicBool>,
        last_click: Arc<Mutex<Instant>>,
        current_sel: Arc<Mutex<Option<SelectionData>>>,
        cb_holder: Arc<Mutex<Option<DotEventCallback>>>,
        hwnd_holder: Arc<AtomicU64>,
    ) {
        unsafe {
            let instance = GetModuleHandleW(None).unwrap_or(HMODULE(std::ptr::null_mut()));
            let class_name = wide_null("SnapwordNativeDotClass");

            let wc = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(dot_wnd_proc),
                hInstance: instance.into(),
                hCursor: LoadCursorW(None, IDC_HAND).unwrap_or_default(),
                hbrBackground: HBRUSH(std::ptr::null_mut()),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                ..Default::default()
            };
            RegisterClassW(&wc);

            let hwnd_res = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE,
                PCWSTR(class_name.as_ptr()),
                PCWSTR(wide_null("SnapwordDot").as_ptr()),
                WS_POPUP,
                0,
                0,
                24,
                24,
                None,
                None,
                Some(instance.into()),
                None,
            );

            let hwnd = match hwnd_res {
                Ok(h) => h,
                Err(_) => {
                    is_running.store(false, Ordering::SeqCst);
                    return;
                }
            };

            // Layered window color key: RGB(255, 0, 255) is transparent
            let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0x00FF00FF), 255, LWA_COLORKEY);

            DOT_HWND = hwnd;
            hwnd_holder.store(hwnd.0 as u64, Ordering::SeqCst);

            // Install low level mouse hook
            HOOK_HANDLE = SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(low_level_mouse_proc),
                Some(instance.into()),
                0,
            )
            .unwrap_or(HHOOK(std::ptr::null_mut()));

            let mut msg = MSG::default();
            while is_running.load(Ordering::Relaxed) && GetMessageW(&mut msg, None, 0, 0).as_bool() {
                match msg.message {
                    WM_DOT_MOUSE_UP => {
                        handle_mouse_up(
                            hwnd,
                            &dot_visible,
                            &current_sel,
                            &cb_holder,
                        );
                    }
                    WM_DOT_MOUSE_DOWN => {
                        handle_mouse_down(
                            hwnd,
                            &dot_visible,
                            &last_click,
                            &current_sel,
                            &cb_holder,
                        );
                    }
                    WM_DOT_MOUSE_WHEEL => {
                        if dot_visible.swap(false, Ordering::SeqCst) {
                            let _ = ShowWindow(hwnd, SW_HIDE);
                            let seq = current_sel.lock().unwrap().as_ref().map(|s| s.seq).unwrap_or(0);
                            let guard = cb_holder.lock().unwrap();
                            if let Some(ref cb) = *guard {
                                cb(DotEvent::Hidden {
                                    seq,
                                    reason: "scroll".to_string(),
                                });
                            }
                        }
                    }
                    _ => {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
            }

            if !HOOK_HANDLE.0.is_null() {
                let _ = UnhookWindowsHookEx(HOOK_HANDLE);
                HOOK_HANDLE = HHOOK(std::ptr::null_mut());
            }
            if !DOT_HWND.0.is_null() {
                let _ = DestroyWindow(DOT_HWND);
                DOT_HWND = HWND(std::ptr::null_mut());
            }
            hwnd_holder.store(0, Ordering::SeqCst);
            is_running.store(false, Ordering::SeqCst);
        }
    }

    fn handle_mouse_up(
        hwnd: HWND,
        dot_visible: &Arc<AtomicBool>,
        current_sel: &Arc<Mutex<Option<SelectionData>>>,
        _cb_holder: &Arc<Mutex<Option<DotEventCallback>>>,
    ) {
        if dot_visible.load(Ordering::Relaxed) {
            return;
        }

        let probe_mgr = uia_probe::get_probe_manager();
        let default_whitelist = vec!["chrome.exe".to_string(), "msedge.exe".to_string()];
        if let Ok(selection) = probe_mgr.probe_selection(100, default_whitelist) {
            if selection.text.is_empty() || !selection.is_english {
                return;
            }

            unsafe {
                let primary_w = GetSystemMetrics(SM_CXSCREEN) as f64;
                let primary_h = GetSystemMetrics(SM_CYSCREEN) as f64;

                let target_rect = selection.rects.last().cloned().unwrap_or(RectData {
                    x: selection.pointer.x,
                    y: selection.pointer.y,
                    width: 0.0,
                    height: 0.0,
                });

                let (x, y) = calculate_dot_position(
                    &target_rect,
                    &selection.pointer,
                    primary_w,
                    primary_h,
                );

                *current_sel.lock().unwrap() = Some(selection);

                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    x as i32,
                    y as i32,
                    24,
                    24,
                    SWP_SHOWWINDOW | SWP_NOACTIVATE,
                );
                dot_visible.store(true, Ordering::SeqCst);
            }
        }
    }

    fn handle_mouse_down(
        hwnd: HWND,
        dot_visible: &Arc<AtomicBool>,
        last_click: &Arc<Mutex<Instant>>,
        current_sel: &Arc<Mutex<Option<SelectionData>>>,
        cb_holder: &Arc<Mutex<Option<DotEventCallback>>>,
    ) {
        if !dot_visible.load(Ordering::Relaxed) {
            return;
        }

        unsafe {
            let mut pt = POINT::default();
            let _ = GetCursorPos(&mut pt);

            let mut w_rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut w_rect);

            if pt.x >= w_rect.left
                && pt.x <= w_rect.right
                && pt.y >= w_rect.top
                && pt.y <= w_rect.bottom
            {
                let now = Instant::now();
                let mut last = last_click.lock().unwrap();
                if now.duration_since(*last) < Duration::from_millis(300) {
                    return;
                }
                *last = now;
                drop(last);

                dot_visible.store(false, Ordering::SeqCst);
                let _ = ShowWindow(hwnd, SW_HIDE);

                if let Some(sel) = current_sel.lock().unwrap().take() {
                    let guard = cb_holder.lock().unwrap();
                    if let Some(ref cb) = *guard {
                        cb(DotEvent::Clicked(sel));
                    }
                }
            } else {
                dot_visible.store(false, Ordering::SeqCst);
                let _ = ShowWindow(hwnd, SW_HIDE);

                let seq = current_sel.lock().unwrap().as_ref().map(|s| s.seq).unwrap_or(0);
                let guard = cb_holder.lock().unwrap();
                if let Some(ref cb) = *guard {
                    cb(DotEvent::Hidden {
                        seq,
                        reason: "outside_click".to_string(),
                    });
                }
            }
        }
    }

    fn wide_null(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
}
