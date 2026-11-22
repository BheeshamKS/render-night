// Render Night - UI Theme and Color Palette
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::color::Rgba;

pub const fn hex_rgb(hex: u32) -> Rgba {
    Rgba {
        r: ((hex >> 16) & 0xFF) as f32 / 255.0,
        g: ((hex >> 8) & 0xFF) as f32 / 255.0,
        b: (hex & 0xFF) as f32 / 255.0,
        a: 1.0,
    }
}

pub const fn hex_rgba(hex: u32) -> Rgba {
    Rgba {
        r: ((hex >> 24) & 0xFF) as f32 / 255.0,
        g: ((hex >> 16) & 0xFF) as f32 / 255.0,
        b: ((hex >> 8) & 0xFF) as f32 / 255.0,
        a: (hex & 0xFF) as f32 / 255.0,
    }
}

pub const BG_WINDOW: Rgba = hex_rgb(0x1e1e1e);
pub const BG_AREA: Rgba = hex_rgb(0x262626);
pub const BG_PANEL: Rgba = hex_rgb(0x2e2e2e);
pub const BG_PANEL_ALT: Rgba = hex_rgb(0x333333);
pub const BG_HEADER: Rgba = hex_rgb(0x222222);
pub const BG_INPUT: Rgba = hex_rgb(0x181818);
pub const BG_HOVER: Rgba = hex_rgb(0x383838);
pub const BG_SELECTED: Rgba = hex_rgb(0x2b384a);

pub const BORDER: Rgba = hex_rgb(0x3c3c3c);
pub const BORDER_LIGHT: Rgba = hex_rgb(0x4a4a4a);
pub const BORDER_FOCUS: Rgba = hex_rgb(0x4772b3);

pub const TEXT_PRIMARY: Rgba = hex_rgb(0xf0f0f0);
pub const TEXT_SECONDARY: Rgba = hex_rgb(0xb5b5b5);
pub const TEXT_MUTED: Rgba = hex_rgb(0x888888);
pub const TEXT_DIM: Rgba = hex_rgb(0x606060);

pub const ACCENT_BLUE: Rgba = hex_rgb(0x4772b3);
pub const ACCENT_BLUE_LIGHT: Rgba = hex_rgb(0x5a87cc);
pub const ACCENT_ORANGE: Rgba = hex_rgb(0xd67929);
pub const ACCENT_GREEN: Rgba = hex_rgb(0x3dae58);
pub const ACCENT_RED: Rgba = hex_rgb(0xc53a3a);
pub const ACCENT_PURPLE: Rgba = hex_rgb(0x8a5cb8);

pub const STATUS_QUEUED_BG: Rgba = hex_rgb(0x383838);
pub const STATUS_QUEUED_TEXT: Rgba = hex_rgb(0xcccccc);
pub const STATUS_ACTIVE_BG: Rgba = hex_rgb(0x1d4726);
pub const STATUS_ACTIVE_TEXT: Rgba = hex_rgb(0x66dd80);
pub const STATUS_PAUSED_BG: Rgba = hex_rgb(0x4a3a14);
pub const STATUS_PAUSED_TEXT: Rgba = hex_rgb(0xf0c050);
pub const STATUS_DONE_BG: Rgba = hex_rgb(0x1a3d24);
pub const STATUS_DONE_TEXT: Rgba = hex_rgb(0x55cc75);
pub const STATUS_FAILED_BG: Rgba = hex_rgb(0x4a1d1d);
pub const STATUS_FAILED_TEXT: Rgba = hex_rgb(0xff7777);

pub const BADGE_GPU_BG: Rgba = hex_rgb(0x153d2e);
pub const BADGE_GPU_TEXT: Rgba = hex_rgb(0x40dfa0);
pub const BADGE_CPU_BG: Rgba = hex_rgb(0x1e2e4a);
pub const BADGE_CPU_TEXT: Rgba = hex_rgb(0x60a0f0);

pub const WARNING_BG: Rgba = hex_rgb(0x352b12);
pub const WARNING_BORDER: Rgba = hex_rgb(0x7a6020);
pub const WARNING_TEXT: Rgba = hex_rgb(0xf5ca60);

pub const CHANGES_BG: Rgba = hex_rgb(0x382414);
pub const CHANGES_BORDER: Rgba = hex_rgb(0x7a4a20);
pub const CHANGES_TEXT: Rgba = hex_rgb(0xf59850);

pub const SPARKLINE_BAR: Rgba = hex_rgb(0x4772b3);
pub const SPARKLINE_BAR_SLOW: Rgba = hex_rgb(0xd67929);
pub const SPARKLINE_BAR_FAILED: Rgba = hex_rgb(0xc53a3a);

pub const OVERLAY_DIM: Rgba = hex_rgba(0x000000a0);
