mod types;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use napi_derive::napi;
use std::sync::Arc;
pub use types::*;

fn map_selection_to_probe_result(data: uia_probe::SelectionData) -> ProbeResult {
    ProbeResult {
        success: true,
        error_code: None,
        error_message: None,
        source: data.source,
        seq: data.seq,
        text: data.text,
        text_truncated: data.text_truncated,
        rects: data
            .rects
            .into_iter()
            .map(|r| DipRect {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
            })
            .collect(),
        anchor: DipPoint {
            x: data.anchor.x,
            y: data.anchor.y,
        },
        pointer: DipPoint {
            x: data.pointer.x,
            y: data.pointer.y,
        },
        process_name: data.process_name,
        process_id: data.process_id,
        window_title: data.window_title,
        paragraph: data.paragraph,
        paragraph_error: data.paragraph_error,
        paragraph_truncated: data.paragraph_truncated,
        captured_at: data.captured_at,
        elapsed_ms: data.elapsed_ms,
        dpi_scale: data.dpi_scale,
        coordinate_space: data.coordinate_space,
        selection_ranges: data.selection_ranges,
        is_english: data.is_english,
        warnings: data.warnings,
    }
}

fn empty_probe_error(code: &str, message: &str) -> ProbeResult {
    ProbeResult {
        success: false,
        error_code: Some(code.to_string()),
        error_message: Some(message.to_string()),
        source: "hotkey".to_string(),
        seq: 0,
        text: String::new(),
        text_truncated: false,
        rects: Vec::new(),
        anchor: DipPoint { x: 0.0, y: 0.0 },
        pointer: DipPoint { x: 0.0, y: 0.0 },
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
        warnings: vec![format!("{}: {}", code, message)],
    }
}

#[napi]
pub fn probe_selection(timeout_ms: Option<u32>) -> ProbeResult {
    let timeout = timeout_ms.unwrap_or(500) as u64;
    let mgr = uia_probe::get_probe_manager();
    let whitelist = vec!["chrome.exe".to_string(), "msedge.exe".to_string()];

    match mgr.probe_selection(timeout, whitelist) {
        Ok(data) => map_selection_to_probe_result(data),
        Err(err_code) => empty_probe_error(&err_code, "UIA probe failed or rejected"),
    }
}

#[napi]
pub fn probe_selection_detailed(
    timeout_ms: Option<u32>,
    _window_title: Option<String>,
) -> ProbeResult {
    probe_selection(timeout_ms)
}

#[napi]
pub fn probe_expand_units(
    timeout_ms: Option<u32>,
    _window_title: Option<String>,
) -> Vec<ExpandUnitSample> {
    let res = probe_selection(timeout_ms);
    if res.success {
        vec![
            ExpandUnitSample {
                unit_name: "Word".to_string(),
                char_count: res.text.len() as u32,
                text_sample: res.text.clone(),
            },
            ExpandUnitSample {
                unit_name: "Paragraph".to_string(),
                char_count: res.paragraph.len() as u32,
                text_sample: res.paragraph,
            },
        ]
    } else {
        Vec::new()
    }
}

#[napi]
pub fn probe_range_from_point(
    x: f64,
    y: f64,
    timeout_ms: Option<u32>,
    _window_title: Option<String>,
) -> ProbeResult {
    let mut res = probe_selection(timeout_ms);
    res.pointer = DipPoint { x, y };
    res
}

#[napi(ts_args_type = "callback: (event: DotEventJs) => void")]
pub fn start_dot(callback: Function<DotEventJs, ()>) -> Result<()> {
    let tsfn = callback
        .build_threadsafe_function()
        .build_callback(|ctx| Ok((ctx.value,)))?;

    let dot_mgr = dot_window::get_dot_manager();
    let tsfn_arc = Arc::new(tsfn);

    dot_mgr.set_callback(Box::new(move |event| {
        let js_event = match event {
            dot_window::DotEvent::Clicked(sel) => DotEventJs {
                event_type: "clicked".to_string(),
                seq: sel.seq,
                reason: None,
                payload: Some(map_selection_to_probe_result(sel)),
                foreground: None,
            },
            dot_window::DotEvent::Hidden { seq, reason } => DotEventJs {
                event_type: "hidden".to_string(),
                seq,
                reason: Some(reason),
                payload: None,
                foreground: None,
            },
            dot_window::DotEvent::ForegroundChanged {
                process_name,
                process_id,
                window_title,
                is_fullscreen,
            } => DotEventJs {
                event_type: "foreground_changed".to_string(),
                seq: 0,
                reason: None,
                payload: None,
                foreground: Some(ForegroundInfo {
                    process_name,
                    process_id,
                    window_title,
                    is_fullscreen,
                }),
            },
        };

        let _ = tsfn_arc.call(js_event, ThreadsafeFunctionCallMode::NonBlocking);
    }));

    dot_mgr
        .start()
        .map_err(|e| Error::from_reason(format!("Failed to start dot window: {}", e)))
}

#[napi]
pub fn stop_dot() -> Result<()> {
    dot_window::get_dot_manager().stop();
    Ok(())
}

#[napi]
pub fn hide_dot() -> Result<()> {
    dot_window::get_dot_manager().hide("hide_dot");
    Ok(())
}

#[napi]
pub fn diagnose() -> DiagnoseResult {
    let diag = uia_probe::get_probe_manager().diagnose();
    let dot_visible = dot_window::get_dot_manager().is_visible();

    DiagnoseResult {
        uia_available: diag.uia_available,
        hook_installed: diag.hook_installed,
        dot_visible,
        foreground: diag.foreground.map(|f| ForegroundInfo {
            process_name: f.process_name,
            process_id: f.process_id,
            window_title: f.window_title,
            is_fullscreen: f.is_fullscreen,
        }),
        addon_version: "1.0.0".to_string(),
        os_version: diag.os_version,
        dpi_scale: diag.dpi_scale,
        warnings: diag.warnings,
    }
}
