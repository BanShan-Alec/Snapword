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
    is_dark: Arc<AtomicBool>,
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
            is_dark: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_theme(&self, is_dark: bool) {
        self.is_dark.store(is_dark, Ordering::SeqCst);
        #[cfg(windows)]
        {
            let hwnd_raw = self.hwnd_holder.load(Ordering::SeqCst);
            if hwnd_raw > 0 {
                unsafe {
                    let _ = windows::Win32::UI::WindowsAndMessaging::PostMessageW(
                        Some(windows::Win32::Foundation::HWND(hwnd_raw as *mut _)),
                        imp::WM_DOT_THEME_CHANGED,
                        windows::Win32::Foundation::WPARAM(if is_dark { 1 } else { 0 }),
                        windows::Win32::Foundation::LPARAM(0),
                    );
                }
            }
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
            let is_dark = self.is_dark.clone();

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
                        is_dark,
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
    let dot_w = 48.0;
    let dot_h = 48.0;
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
    use windows::Win32::System::LibraryLoader::{
        GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
    };
    use windows::Win32::UI::WindowsAndMessaging::*;

    pub const WM_DOT_THEME_CHANGED: u32 = WM_USER + 104;
    pub const DOT_WINDOW_SIZE: i32 = 48;
    const TIMER_ID: usize = 1;

    #[allow(dead_code)]
    struct GlobalDotContext {
        is_running: Arc<AtomicBool>,
        dot_visible: Arc<AtomicBool>,
        last_click: Arc<Mutex<Instant>>,
        current_sel: Arc<Mutex<Option<SelectionData>>>,
        cb_holder: Arc<Mutex<Option<DotEventCallback>>>,
        is_dark: Arc<AtomicBool>,
    }

    static mut CTX: Option<GlobalDotContext> = None;
    static mut DOT_HWND: HWND = HWND(std::ptr::null_mut());
    static mut HOOK_HANDLE: HHOOK = HHOOK(std::ptr::null_mut());
    static mut DOT_RECT: RECT = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    static mut TARGET_HWND: HWND = HWND(std::ptr::null_mut());
    static mut SUPPRESS_MOUSE_UP: bool = false;

    fn empty_selection(source: &str, reason: &str) -> SelectionData {
        SelectionData {
            source: source.to_string(),
            seq: 0,
            text: String::new(),
            text_truncated: false,
            rects: Vec::new(),
            anchor: PointData { x: 0.0, y: 0.0 },
            pointer: PointData { x: 0.0, y: 0.0 },
            process_name: "unknown.exe".to_string(),
            process_id: 0,
            window_title: String::new(),
            paragraph: String::new(),
            paragraph_error: None,
            paragraph_truncated: false,
            captured_at: "2026-11-14T00:00:00.000Z".to_string(),
            elapsed_ms: 0.0,
            dpi_scale: 1.0,
            coordinate_space: "dip".to_string(),
            selection_ranges: 0,
            is_english: false,
            warnings: vec![reason.to_string()],
        }
    }

    unsafe fn is_fullscreen(hwnd: HWND) -> bool {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: core::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return false;
        }
        let mon = info.rcMonitor;
        rect.left <= mon.left && rect.top <= mon.top && rect.right >= mon.right && rect.bottom >= mon.bottom
    }

    fn is_dot_hit(pt: POINT, dot_rect: RECT, hwnd: HWND) -> bool {
        if pt.x >= dot_rect.left
            && pt.x <= dot_rect.right
            && pt.y >= dot_rect.top
            && pt.y <= dot_rect.bottom
        {
            return true;
        }

        if !hwnd.0.is_null() {
            let mut wr = RECT::default();
            if unsafe { GetWindowRect(hwnd, &mut wr) }.is_ok() {
                if pt.x >= wr.left
                    && pt.x <= wr.right
                    && pt.y >= wr.top
                    && pt.y <= wr.bottom
                {
                    return true;
                }
            }
            let from_pt = unsafe { WindowFromPoint(pt) };
            if from_pt == hwnd {
                return true;
            }
        }
        false
    }

    unsafe fn hide_dot_internal(reason: &str) {
        if let Some(ref ctx) = CTX {
            if ctx.dot_visible.swap(false, Ordering::SeqCst) {
                if !DOT_HWND.0.is_null() {
                    let _ = ShowWindow(DOT_HWND, SW_HIDE);
                }
                let seq = ctx
                    .current_sel
                    .lock()
                    .unwrap()
                    .as_ref()
                    .map(|s| s.seq)
                    .unwrap_or(0);
                let guard = ctx.cb_holder.lock().unwrap();
                if let Some(ref cb) = *guard {
                    cb(DotEvent::Hidden {
                        seq,
                        reason: reason.to_string(),
                    });
                }
            }
        }
    }

    unsafe fn handle_dot_click() {
        if let Some(ref ctx) = CTX {
            let now = Instant::now();
            let mut last = ctx.last_click.lock().unwrap();
            if now.duration_since(*last) < Duration::from_millis(300) {
                return;
            }
            *last = now;
        }

        let (target, sel) = if let Some(ref ctx) = CTX {
            let mut guard = ctx.current_sel.lock().unwrap();
            let s = guard.take();
            (TARGET_HWND, s)
        } else {
            (HWND::default(), None)
        };

        // Hide dot window without emitting premature hidden event
        if let Some(ref ctx) = CTX {
            ctx.dot_visible.store(false, Ordering::SeqCst);
        }
        if !DOT_HWND.0.is_null() {
            let _ = ShowWindow(DOT_HWND, SW_HIDE);
        }

        let final_sel = if let Some(s) = sel {
            s
        } else if !target.0.is_null() {
            let probe_mgr = uia_probe::get_probe_manager();
            let whitelist = vec!["chrome.exe".to_string(), "msedge.exe".to_string()];
            match probe_mgr.probe_selection(300, whitelist) {
                Ok(s) => s,
                Err(_) => empty_selection("dot_click", "Selection lost on dot click"),
            }
        } else {
            empty_selection("dot_click", "No target window for dot click")
        };

        if let Some(ref ctx) = CTX {
            let guard = ctx.cb_holder.lock().unwrap();
            if let Some(ref cb) = *guard {
                cb(DotEvent::Clicked(final_sel));
            }
        }
    }

    unsafe fn handle_mouse_up() {
        let target = GetForegroundWindow();
        if target.0.is_null() || is_fullscreen(target) {
            return;
        }

        let is_visible = if let Some(ref ctx) = CTX {
            ctx.dot_visible.load(Ordering::Relaxed)
        } else {
            false
        };
        if is_visible {
            return;
        }

        let probe_mgr = uia_probe::get_probe_manager();
        let whitelist = vec!["chrome.exe".to_string(), "msedge.exe".to_string()];
        if let Ok(selection) = probe_mgr.probe_selection(300, whitelist) {
            let proc_lower = selection.process_name.to_lowercase();
            if proc_lower == "electron.exe" || proc_lower.contains("snapword") {
                return;
            }
            if selection.text.is_empty() || !selection.is_english {
                return;
            }

            let Some(rect) = selection
                .rects
                .iter()
                .rev()
                .find(|r| r.width > 1.0)
                .or_else(|| selection.rects.last())
            else {
                return;
            };

            let mut x = (rect.x + rect.width) as i32 + 8;
            let mut y = (rect.y + rect.height) as i32 + 8;

            let monitor = MonitorFromPoint(
                POINT {
                    x: rect.x as i32,
                    y: rect.y as i32,
                },
                MONITOR_DEFAULTTONEAREST,
            );
            let mut info = MONITORINFO {
                cbSize: core::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(monitor, &mut info).as_bool() {
                let work = info.rcWork;
                if x + DOT_WINDOW_SIZE > work.right {
                    x = (rect.x as i32) - 8 - DOT_WINDOW_SIZE;
                }
                if y + DOT_WINDOW_SIZE > work.bottom {
                    y = (rect.y as i32) - 8 - DOT_WINDOW_SIZE;
                }
                x = x.max(work.left).min(work.right - DOT_WINDOW_SIZE);
                y = y.max(work.top).min(work.bottom - DOT_WINDOW_SIZE);
            }

            DOT_RECT = RECT {
                left: x,
                top: y,
                right: x + DOT_WINDOW_SIZE,
                bottom: y + DOT_WINDOW_SIZE,
            };
            TARGET_HWND = target;

            if let Some(ref ctx) = CTX {
                *ctx.current_sel.lock().unwrap() = Some(selection);
                ctx.dot_visible.store(true, Ordering::SeqCst);
            }

            let _ = SetWindowPos(
                DOT_HWND,
                Some(HWND_TOPMOST),
                x,
                y,
                DOT_WINDOW_SIZE,
                DOT_WINDOW_SIZE,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            let _ = ShowWindow(DOT_HWND, SW_SHOWNOACTIVATE);
        }
    }

    unsafe fn check_visibility() {
        let is_visible = if let Some(ref ctx) = CTX {
            ctx.dot_visible.load(Ordering::Relaxed)
        } else {
            false
        };
        if !is_visible {
            return;
        }

        let foreground = GetForegroundWindow();
        if foreground.0.is_null() {
            hide_dot_internal("focus_lost");
            return;
        }

        if is_fullscreen(foreground) {
            hide_dot_internal("fullscreen_suppression");
            return;
        }

        // If foreground window changed away from target application and not our dot
        if foreground != TARGET_HWND && foreground != DOT_HWND {
            let mut pid = 0u32;
            GetWindowThreadProcessId(foreground, Some(&mut pid));
            if pid != std::process::id() {
                hide_dot_internal("focus_lost");
            }
        }
    }

    unsafe extern "system" fn low_level_mouse_proc(
        ncode: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if ncode >= 0 && !DOT_HWND.0.is_null() {
            let msg = wparam.0 as u32;
            let ms = *(lparam.0 as *const MSLLHOOKSTRUCT);

            match msg {
                WM_LBUTTONDOWN => {
                    let is_vis = if let Some(ref ctx) = CTX {
                        ctx.dot_visible.load(Ordering::Relaxed)
                    } else {
                        false
                    };
                    let in_rect = is_dot_hit(ms.pt, DOT_RECT, DOT_HWND);
                    if is_vis && in_rect {
                        SUPPRESS_MOUSE_UP = true;
                        handle_dot_click();
                        return LRESULT(1); // Swallow mouse down on dot!
                    } else if is_vis {
                        hide_dot_internal("outside_click");
                    }
                }
                WM_LBUTTONUP => {
                    if SUPPRESS_MOUSE_UP {
                        SUPPRESS_MOUSE_UP = false;
                        return LRESULT(1); // Swallow mouse up on dot!
                    } else {
                        handle_mouse_up();
                    }
                }
                WM_MOUSEWHEEL | WM_MBUTTONDOWN | WM_RBUTTONDOWN => {
                    let is_vis = if let Some(ref ctx) = CTX {
                        ctx.dot_visible.load(Ordering::Relaxed)
                    } else {
                        false
                    };
                    if is_vis {
                        hide_dot_internal("outside_click");
                    }
                }
                _ => {}
            }
        }
        CallNextHookEx(None, ncode, wparam, lparam)
    }

    unsafe extern "system" fn dot_wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
            WM_SETCURSOR | WM_MOUSEMOVE => {
                let cursor = LoadCursorW(None, IDC_HAND).unwrap_or_default();
                let _ = SetCursor(Some(cursor));
                LRESULT(1)
            }
            WM_LBUTTONDOWN => {
                handle_dot_click();
                LRESULT(0)
            }
            WM_TIMER => {
                check_visibility();
                LRESULT(0)
            }
            WM_DOT_THEME_CHANGED => {
                let is_dark = wparam.0 == 1;
                let _ = update_dot_surface(hwnd, is_dark);
                LRESULT(0)
            }
            WM_CLOSE => {
                let _ = DestroyWindow(hwnd);
                LRESULT(0)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    /// Draw antialiased dot on 32-bit premultiplied DIB section
    unsafe fn update_dot_surface(hwnd: HWND, is_dark: bool) -> windows::core::Result<()> {
        let screen_dc: HDC = GetDC(None);
        let memory_dc = CreateCompatibleDC(Some(screen_dc));
        let mut bits: *mut core::ffi::c_void = core::ptr::null_mut();
        let bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: core::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: DOT_WINDOW_SIZE,
                biHeight: -DOT_WINDOW_SIZE, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let bitmap = CreateDIBSection(
            Some(memory_dc),
            &bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            None,
            0,
        )?;
        let previous = SelectObject(memory_dc, bitmap.into());
        let pixels = std::slice::from_raw_parts_mut(
            bits.cast::<u32>(),
            (DOT_WINDOW_SIZE * DOT_WINDOW_SIZE) as usize,
        );
        draw_dot(pixels, is_dark);

        let size = SIZE {
            cx: DOT_WINDOW_SIZE,
            cy: DOT_WINDOW_SIZE,
        };
        let source = POINT { x: 0, y: 0 };
        let blend = BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: 255,
            AlphaFormat: AC_SRC_ALPHA as u8,
        };
        let _ = UpdateLayeredWindow(
            hwnd,
            Some(screen_dc),
            None,
            Some(&size),
            Some(memory_dc),
            Some(&source),
            COLORREF(0),
            Some(&blend),
            ULW_ALPHA,
        );

        let _ = SelectObject(memory_dc, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory_dc);
        ReleaseDC(None, screen_dc);
        Ok(())
    }

    fn draw_dot(pixels: &mut [u32], is_dark: bool) {
        let center = DOT_WINDOW_SIZE as f64 / 2.0; // 18.0
        let radius = 9.0; // 18px visual diameter
        let ring = radius + 1.0; // 20px with 1px border
        const SAMPLES: i32 = 4;

        // Claude Light: #BA5B37 -> R=186, G=91, B=55. Border: #FFFFFF
        // Paseo Dark:   #20744A -> R=32, G=116, B=74. Border: #FAFAFA
        let (cr, cg, cb) = if is_dark {
            (32u32, 116u32, 74u32)
        } else {
            (186u32, 91u32, 55u32)
        };
        let (br, bg, bb) = if is_dark {
            (250u32, 250u32, 250u32)
        } else {
            (255u32, 255u32, 255u32)
        };

        for y in 0..DOT_WINDOW_SIZE {
            for x in 0..DOT_WINDOW_SIZE {
                let mut alpha_sum = 0u32;
                let mut r_sum = 0u32;
                let mut g_sum = 0u32;
                let mut b_sum = 0u32;
                for sy in 0..SAMPLES {
                    for sx in 0..SAMPLES {
                        let px = x as f64 + (sx as f64 + 0.5) / SAMPLES as f64;
                        let py = y as f64 + (sy as f64 + 0.5) / SAMPLES as f64;
                        let distance = ((px - center).powi(2) + (py - center).powi(2)).sqrt();
                        if distance <= radius {
                            alpha_sum += 255;
                            r_sum += cr;
                            g_sum += cg;
                            b_sum += cb;
                        } else if distance <= ring {
                            alpha_sum += 255;
                            r_sum += br;
                            g_sum += bg;
                            b_sum += bb;
                        }
                    }
                }
                let samples = (SAMPLES * SAMPLES) as u32;
                let alpha = alpha_sum / samples;
                let r = r_sum / samples;
                let g = g_sum / samples;
                let b = b_sum / samples;
                let index = (y * DOT_WINDOW_SIZE + x) as usize;
                pixels[index] = (alpha << 24) | (r << 16) | (g << 8) | b;
            }
        }
    }

    pub fn run_dot_window_loop(
        is_running: Arc<AtomicBool>,
        dot_visible: Arc<AtomicBool>,
        last_click: Arc<Mutex<Instant>>,
        current_sel: Arc<Mutex<Option<SelectionData>>>,
        cb_holder: Arc<Mutex<Option<DotEventCallback>>>,
        hwnd_holder: Arc<AtomicU64>,
        is_dark: Arc<AtomicBool>,
    ) {
        unsafe {
            let _ = windows::Win32::UI::HiDpi::SetThreadDpiAwarenessContext(
                windows::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
            );

            let mut module = windows::Win32::Foundation::HMODULE::default();
            let _ = GetModuleHandleExW(
                GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS
                    | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                PCWSTR(low_level_mouse_proc as *const u16),
                &mut module,
            );
            let instance = HINSTANCE(module.0);

            let class_name = wide_null("SnapwordNativeDotClass");
            let cursor = LoadCursorW(None, IDC_HAND).unwrap_or_default();

            let wc = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(dot_wnd_proc),
                hInstance: instance,
                hCursor: cursor,
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
                DOT_WINDOW_SIZE,
                DOT_WINDOW_SIZE,
                None,
                None,
                Some(instance),
                None,
            );

            let hwnd = match hwnd_res {
                Ok(h) => h,
                Err(_) => {
                    is_running.store(false, Ordering::SeqCst);
                    return;
                }
            };

            DOT_HWND = hwnd;
            hwnd_holder.store(hwnd.0 as u64, Ordering::SeqCst);

            CTX = Some(GlobalDotContext {
                is_running: is_running.clone(),
                dot_visible: dot_visible.clone(),
                last_click,
                current_sel,
                cb_holder,
                is_dark: is_dark.clone(),
            });

            // Initial surface rendering using UpdateLayeredWindow
            let init_dark = is_dark.load(Ordering::Relaxed);
            let _ = update_dot_surface(hwnd, init_dark);

            // Install low-level mouse hook using module HINSTANCE
            HOOK_HANDLE = SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(low_level_mouse_proc),
                Some(instance),
                0,
            )
            .unwrap_or(HHOOK(std::ptr::null_mut()));

            SetTimer(Some(hwnd), TIMER_ID, 200, None);

            let mut msg = MSG::default();
            while is_running.load(Ordering::Relaxed) && GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            let _ = KillTimer(Some(hwnd), TIMER_ID);

            if !HOOK_HANDLE.0.is_null() {
                let _ = UnhookWindowsHookEx(HOOK_HANDLE);
                HOOK_HANDLE = HHOOK(std::ptr::null_mut());
            }
            if !DOT_HWND.0.is_null() {
                let _ = DestroyWindow(DOT_HWND);
                DOT_HWND = HWND(std::ptr::null_mut());
            }
            CTX = None;
            hwnd_holder.store(0, Ordering::SeqCst);
            is_running.store(false, Ordering::SeqCst);
        }
    }

    fn wide_null(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
}
