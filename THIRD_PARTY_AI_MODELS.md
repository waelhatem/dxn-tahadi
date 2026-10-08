# Third-party AI models (Design Studio, in-browser)

All models below run **inside the user's browser** with ONNX Runtime Web. No image is sent to a server and no API key is used.
Every model is **pinned** to an exact file and verified in the browser (size + SHA-256) before it is used.
Only licenses that allow **commercial use** are accepted.

Source of truth for URLs, sizes and hashes: `app/design-studio/engines/browser-ai/models.mjs` (checked by `tests/design-studio-platform.test.js`).

## Models in use

| Tool (UI) | Model | License | Commercial use | File(s) | Size | Source / pinned revision | SHA-256 |
|---|---|---|---|---|---|---|---|
| زيادة الدقة, تحسين الصورة (AI ×2) | Real-ESRGAN General x4v3 (SRVGGNetCompact) | BSD-3-Clause (© 2021 Xintao Wang) | Yes | `real_esrgan_general_x4v3.onnx` + `real_esrgan_general_x4v3.data` | 0.16 MB + 4.61 MB | Qualcomm AI Hub official ONNX export v0.64.0, self-hosted in `app/design-studio/models/` (license text in `LICENSE-real-esrgan.txt`) | `09e6b675…6241c858e7` / `512d0ec9…bc98f37f` |
| إزالة الخلفية / تغيير الخلفية — «شخص» | MODNet (ZHKKKe/MODNet) int8, **WASM only** | Apache-2.0 | Yes | `onnx/model_quantized.onnx` | 6.3 MB | huggingface.co/Xenova/modnet @ `fa2fa546052fba4c08921230a26cc69a333fca12` | `92e49898…c1105fee3a` |
| إزالة الخلفية — «منتج أو أي عنصر», تصميم المنتج (WebGPU) | ORMBG (Open Remove Background, schirrmacher/ormbg) fp16 | Apache-2.0 | Yes | `onnx/model_fp16.onnx` | 84.0 MB | huggingface.co/onnx-community/ormbg-ONNX @ `034e2d884afbab897e10e78fc5bb566b29533fd6` | `06e4236d…70a554b661` |
| same (WASM) | ORMBG int8 | Apache-2.0 | Yes | `onnx/model_quantized.onnx` | 42.3 MB | same repo and revision | `ffbcae62…ef00171` |
| إزالة عناصر (تجريبي) | MI-GAN pipeline v2 (Picsart AI Research) | MIT (© 2024 Picsart AI Research) | Yes | `migan_pipeline_v2.onnx` | 26.8 MB | huggingface.co/andraniksargsyan/migan @ `406830d0fa60666da0071c342ad2fbc8f30c5c64` | `6f1f3530…8a48c40b` |

Full hashes are in `models.mjs`.

**MODNet runs on WASM only.** On the WebGPU backend of ONNX Runtime Web 1.30 both the fp16 and fp32 MODNet files returned a wrong matte (the person was lost) on Chrome 154 / Windows 10; the int8 file on WASM is correct. ORMBG and Real-ESRGAN were verified correct on WebGPU.

## Runtime

| Component | License | Delivery |
|---|---|---|
| ONNX Runtime Web 1.30.0 | MIT | jsDelivr (`cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0`), loaded only when a free AI tool runs. WebGPU build when available, otherwise WASM. |

## Considered and rejected

| Model | Reason |
|---|---|
| BRIA RMBG-1.4 / RMBG-2.0 | Non-commercial license (CC BY-NC / BRIA license). Not allowed: the project may be used commercially. |
| @imgly/background-removal (JS library) | AGPL-3.0. Not allowed. |
| BiRefNet-lite (MIT) | License OK, but ~109 MB (fp16) / ~214 MB (fp32); ORMBG gives similar results at a smaller size. Candidate for later. |
| LaMa (Apache-2.0) | License OK, but ~200 MB ONNX; MI-GAN is ~27 MB. |
| Hugging Face re-uploads of Real-ESRGAN without provenance | Could not be verified against the official release; the official Qualcomm export is used instead. |

## Rules for adding a model

1. License must allow commercial use (MIT, Apache-2.0, BSD). No NC, no AGPL, no "research only".
2. Pin to an exact commit/release and record bytes + SHA-256 in `models.mjs`.
3. The host must allow browser download (CORS) or the file is self-hosted with its license notice.
4. Add a row to this file.
