export const GUEST_RELEASE_TAG = "guest-v0.1.0";
export const GUEST_WASM_URL =
  `https://github.com/ParaN3xus/worker-sidecar/releases/download/${GUEST_RELEASE_TAG}/guest.wasm`;

export const FONT_BASE_URL =
  "https://raw.githubusercontent.com/typst/typst-assets/main/files/fonts/";

export const FONT_FILES = [
  "LibertinusSerif-Regular.otf",
  "LibertinusSerif-Bold.otf",
  "LibertinusSerif-Italic.otf",
  "LibertinusSerif-BoldItalic.otf",
  "LibertinusSerif-Semibold.otf",
  "LibertinusSerif-SemiboldItalic.otf",
  "NewCMMath-Book.otf",
  "NewCMMath-Regular.otf",
  "NewCMMath-Bold.otf",
  "DejaVuSansMono.ttf",
] as const;
