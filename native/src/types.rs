use napi_derive::napi;

#[napi(object)]
#[derive(Debug, Clone)]
pub struct DipRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct DipPoint {
    pub x: f64,
    pub y: f64,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub success: bool,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub source: String,
    pub seq: u32,
    pub text: String,
    pub text_truncated: bool,
    pub rects: Vec<DipRect>,
    pub anchor: DipPoint,
    pub pointer: DipPoint,
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

#[napi(object)]
#[derive(Debug, Clone)]
pub struct ForegroundInfo {
    pub process_name: String,
    pub process_id: i32,
    pub window_title: String,
    pub is_fullscreen: bool,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct DiagnoseResult {
    pub uia_available: bool,
    pub hook_installed: bool,
    pub dot_visible: bool,
    pub foreground: Option<ForegroundInfo>,
    pub addon_version: String,
    pub os_version: String,
    pub dpi_scale: f64,
    pub warnings: Vec<String>,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct ExpandUnitSample {
    pub unit_name: String,
    pub char_count: u32,
    pub text_sample: String,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct DotEventJs {
    pub event_type: String, // "clicked" | "hidden" | "foreground_changed"
    pub seq: u32,
    pub reason: Option<String>,
    pub payload: Option<ProbeResult>,
    pub foreground: Option<ForegroundInfo>,
}
