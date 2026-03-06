# Video & Audio Tools

Status: draft | Updated: 2026-03-05

## Overview

FFmpeg-based video/audio processing tools. Processing is split between local CPU (short videos) and Cortex GPU (long videos), routed by video duration. Routing is automatic and transparent to the user.

Target users: international students needing video compression for WeChat/email, format conversion (iPhone MOV), audio extraction from lectures, etc.

## Architecture

### Processing Tiers

Routing is based on **video duration** (obtained via `ffprobe` after upload). File size serves only as an upload safety limit.

```
Upload (max 500 MB hard limit)
  |
  ffprobe -> extract duration
  |
  +-- duration <= THRESHOLD_LOCAL (60s)  --> Local backend, CPU ffmpeg
  +-- duration > LOCAL, <= THRESHOLD_CORTEX (30min) --> Cortex, GPU ffmpeg (NVENC)
  +-- duration > THRESHOLD_CORTEX       --> 413 Rejected
```

- Duration thresholds are config values, tunable without code changes
- Routing decision happens in `VideoService`, invisible to router and frontend
- Cortex uses NVIDIA NVENC (`h264_nvenc`, `hevc_nvenc`) on RTX 4070 Ti
- Billing uses standard per-tool `credit_cost` via `ToolGatewayRoute` (no tier-based pricing)
- Audio-only tools (extract-audio, audio convert) always run locally — CPU audio encoding is fast enough even for long files
- Operations that don't re-encode (trim with `-c copy`, cover extract) always run locally regardless of duration
- If `ffprobe` fails to extract duration (corrupted/non-standard files), fallback to file size: <= 50 MB local, else Cortex
- Fallback also enforces a file size hard cap (500 MB) — files beyond this are rejected regardless of duration result

### Backend Components

```
backend/app/
  routers/video.py          # FastAPI endpoints
  services/video_service.py # Business logic, tier routing
  processing/video.py       # Local ffmpeg subprocess calls
  schemas/video.py          # Request/response models (if needed beyond FileResult)
```

### Task State & Persistence

Task state is stored in the existing SQLite database via `ProcessingHistory`:

- Upload received: insert row with `status=processing`, get `task_id` (= history row id)
- Progress updates: kept in memory (`dict[task_id, float]`) for SSE streaming — no need to persist percent
- Completion: update row to `status=done`, set `output_file_id`
- Failure: update row to `status=failed`
- Service restart recovery: on startup, mark all `status=processing` rows as `failed` (ffmpeg processes are dead)

Authenticated users who leave and return can see their completed/failed tasks via `ProcessingHistory` query.

### Concurrency Control

- Local ffmpeg: `asyncio.Semaphore` limits concurrent processes (`video_local_max_concurrent`, default 2)
- Requests beyond the limit queue and wait; no request is rejected due to concurrency
- Cortex has its own `GPU_BUSY` 503 mechanism — backend does not add extra concurrency control for Cortex path

### Config Additions (`config.py`)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `max_upload_video_mb` | int | 500 | Max upload size for single video file (safety limit) |
| `max_upload_audio_mb` | int | 50 | Max upload size for single audio file |
| `video_local_threshold_sec` | int | 60 | Duration <= this goes to local CPU ffmpeg |
| `video_cortex_threshold_sec` | int | 1800 | Duration <= this goes to Cortex GPU; above = rejected |
| `video_process_timeout` | int | 300 | Max processing time in seconds |
| `video_local_max_concurrent` | int | 2 | Max concurrent local ffmpeg processes |

### Security

- All ffmpeg calls use `subprocess.run([...], shell=False)` — list form, never string
- Temp files via `tempfile.NamedTemporaryFile`, cleaned up in `finally` blocks
- Input filenames are never passed to ffmpeg — only temp file paths
- Timeout enforced via `subprocess.run(timeout=...)` + config value
- nginx: `client_max_body_size 500m` on video upload locations

### Progress Feedback

Real-time progress via SSE (local path only):

1. `ffprobe` extracts total duration before processing
2. ffmpeg runs with `-progress pipe:1`, which outputs `out_time_us=<microseconds>` per frame
3. Backend parses `out_time_us`, computes `percent = out_time / total_duration * 100`
4. Backend pushes progress to frontend via SSE (`GET /api/video/progress/{task_id}`)
5. Frontend displays percentage progress bar

Flow:
```
POST /api/video/compress  -->  202 { task_id }
GET  /api/video/progress/{task_id}  -->  SSE stream: { percent: 42, eta_sec: 15 }
                                         ...
                                         { percent: 100, result: FileResult }
```

**Cortex path**: no real-time progress. Cortex `/v1/ffmpeg` is a synchronous HTTP call (file in, file out). Frontend shows an indeterminate progress indicator ("processing...") for Cortex-routed tasks. Adding progress streaming to Cortex would require making it stateful — deferred to future if user feedback demands it.

Tools that require re-encoding (compress, convert, to-gif) use `access_level: auth` — processing is slow, login ensures result recovery. Fast tools (trim, cover, extract-audio, audio convert) remain `access_level: public`.

If an authenticated user leaves during processing and returns, the frontend checks for pending/completed tasks via `ProcessingHistory` and restores the result on the original tool page.

---

## Tools

### P0 — Core

#### 1. Video Compress

Reduce video file size for sharing (WeChat 25MB limit, email 10MB limit).

**Endpoint:** `POST /api/video/compress`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| file | UploadFile | yes | | Video file |
| quality | string | no | "medium" | "low" / "medium" / "high" — maps to CRF values |
| target_mb | int | no | null | Target file size in MB (overrides quality) |
| resolution | string | no | null | "720p" / "1080p" / null (keep original) |

**Two encoding modes** (mutually exclusive — `target_mb` overrides `quality` when set):

**Mode 1: CRF / CQ (quality preset)**
- CPU: `libx264`, CRF 18/23/28 (high/medium/low), `-preset medium`
- GPU: `h264_nvenc`, CQ 20/25/30, `-preset p4`
- Output size varies by video content; simple scenes compress more

**Mode 2: Target size (two-pass)**
- Calculate target video bitrate: `(target_mb * 8192 kbit) / duration_sec - audio_bitrate`
- CPU: `libx264 -b:v {bitrate} -pass 1` (analysis, no output) then `-pass 2` (encode)
- GPU: `h264_nvenc -b:v {bitrate} -2pass 1` then `-2pass 2` (NVENC native two-pass)
- Result file size closely matches target; useful for WeChat 25MB / email 10MB limits

**Audio:** re-encode to AAC 128k (or copy if already AAC and no size pressure)

**Response:** `FileResult`

#### 2. Video Format Convert

Convert between video formats. Primary use case: MOV to MP4 (iPhone).

**Endpoint:** `POST /api/video/convert`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| file | UploadFile | yes | | Video file |
| output_format | string | yes | | "mp4" / "webm" / "mov" / "avi" / "mkv" |

**FFmpeg strategy:**
- MP4: H.264 + AAC (most compatible)
- WebM: VP9 + Opus
- If input codec matches output container, use `-c copy` (fast remux, no quality loss)

**Response:** `FileResult`

---

### P1 — Common

#### 3. Video to GIF

**Endpoint:** `POST /api/video/to-gif`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| file | UploadFile | yes | | Video file |
| start | float | no | 0 | Start time in seconds |
| duration | float | no | 5 | Duration in seconds (max 15) |
| width | int | no | 480 | Output width (height auto) |
| fps | int | no | 10 | Frame rate (max 15) |

**FFmpeg strategy:** Generate palette first, then produce GIF with palette for quality.

**Response:** `FileResult`

#### 4. Audio Extract

Extract audio track from video.

**Endpoint:** `POST /api/video/extract-audio`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| file | UploadFile | yes | | Video file |
| output_format | string | no | "mp3" | "mp3" / "aac" / "wav" / "flac" |
| bitrate | string | no | "192k" | Audio bitrate (mp3/aac only) |

**FFmpeg strategy:**
- If output matches source codec, use `-c:a copy` (no re-encode)
- Otherwise re-encode to target format

**Response:** `FileResult`

#### 5. Video Trim

Cut a segment from a video by time range.

**Endpoint:** `POST /api/video/trim`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| file | UploadFile | yes | | Video file |
| start | float | yes | | Start time in seconds |
| end | float | yes | | End time in seconds |

**FFmpeg strategy:** `-ss {start} -to {end} -c copy` for fast keyframe-based cut. If precise cut needed, re-encode around cut points only.

**Response:** `FileResult`

---

### P2 — Value-add

#### 6. Audio Format Convert

**Endpoint:** `POST /api/audio/convert`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| file | UploadFile | yes | | Audio file |
| output_format | string | yes | | "mp3" / "aac" / "wav" / "flac" / "ogg" |
| bitrate | string | no | "192k" | Bitrate (lossy formats only) |

**Response:** `FileResult`

#### 7. Video Cover Extract

Extract a frame from video as image.

**Endpoint:** `POST /api/video/cover`

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| file | UploadFile | yes | | Video file |
| time | float | no | 0 | Timestamp in seconds |
| output_format | string | no | "jpg" | "jpg" / "png" |

**FFmpeg strategy:** `-ss {time} -frames:v 1`

**Response:** `FileResult`

---

## Cortex FFmpeg API

Cortex exposes a general-purpose ffmpeg processing endpoint. Unlike the image inference endpoints (base64 JSON), video uses **multipart file upload** due to file sizes.

### POST /v1/ffmpeg

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| file | binary | yes | Input media file |
| args | string (JSON) | yes | FFmpeg output arguments as JSON string array |
| output_ext | string | yes | Output file extension (e.g. "mp4", "gif", "mp3") |
| two_pass | bool | no | Enable two-pass encoding (default: false) |
| timeout | int | no | Per-job timeout in seconds (default: 120, max: 300) |

`args` contains only **output-side** ffmpeg arguments. Cortex constructs the full command:
```
ffmpeg -i {input_temp} {args...} {output_temp}.{output_ext}
```

When `two_pass=true`, Cortex internally runs two ffmpeg commands (pass 1 analysis + pass 2 encode) and manages the intermediate stats file. The caller does not need to handle multi-step orchestration.

**Example request (video compress with NVENC):**
```
args: ["-c:v", "h264_nvenc", "-cq", "25", "-preset", "p4", "-c:a", "aac", "-b:a", "128k"]
output_ext: "mp4"
```

**Response:** `200` with binary file stream (`Content-Type` based on output_ext)

**Error response:**
```json
{
  "error": {
    "code": "FFMPEG_FAILED",
    "message": "ffmpeg exited with code 1: ..."
  }
}
```

Error codes:

| Code | HTTP | Description |
|------|------|-------------|
| `PAYLOAD_TOO_LARGE` | 413 | File exceeds Cortex upload limit |
| `FFMPEG_FAILED` | 500 | ffmpeg process error |
| `FFMPEG_TIMEOUT` | 504 | Processing exceeded timeout |
| `GPU_BUSY` | 503 | All processing slots occupied |

**Security on Cortex side:**
- `args` is validated: only whitelisted ffmpeg flags allowed (no `-f rawvideo`, no pipe/URL outputs, no filter_complex with dangerous filters)
- Input/output are temp files only, cleaned up after response
- Process runs with timeout and memory limits

**Process protection on Cortex side:**
- **Timeout enforcement**: each ffmpeg subprocess has a hard timeout (`subprocess.run(timeout=...)`); on timeout, `process.kill()` + SIGKILL
- **Zombie/orphan cleanup**: on Cortex service startup, scan and kill any lingering ffmpeg child processes from previous runs
- **Periodic health check**: background task (e.g. every 30s) checks all tracked ffmpeg PIDs; if a process is dead but not reaped, clean up its temp files and release the slot
- **Slot limit**: max concurrent ffmpeg processes (e.g. 2 for single GPU); excess requests get `GPU_BUSY` 503 immediately, preventing resource exhaustion
- **Temp file reaper**: on startup and periodically, delete temp files older than `video_process_timeout` to prevent disk fill from crashed jobs

---

## Frontend

### Pages

```
frontend/src/pages/VideoTools/
  VideoToolsIndexPage.tsx    # Tool grid (like ImageToolsIndexPage)
  CompressPage.tsx           # Video compress
  ConvertPage.tsx            # Format convert
  ToGifPage.tsx              # Video to GIF
  ExtractAudioPage.tsx       # Audio extract
  TrimPage.tsx               # Video trim
  CoverPage.tsx              # Cover extract

frontend/src/pages/AudioTools/
  AudioToolsIndexPage.tsx
  ConvertPage.tsx            # Audio format convert
```

### Route Structure

```
/video-tools              -> VideoToolsIndexPage
/video-tools/compress     -> CompressPage
/video-tools/convert      -> ConvertPage
/video-tools/to-gif       -> ToGifPage
/video-tools/extract-audio -> ExtractAudioPage
/video-tools/trim         -> TrimPage
/video-tools/cover        -> CoverPage

/audio-tools              -> AudioToolsIndexPage
/audio-tools/convert      -> ConvertPage
```

### UI Pattern

Same as image tools: `ToolPageShell` + `ToolWorkspaceDropzone` + `useFileUpload`.

Video-specific additions:
- `<video>` tag preview with object URL (instead of `<img>`)
- Video metadata display (duration, resolution, codec, size) — extracted client-side via `URL.createObjectURL` + `<video>.onloadedmetadata`
- For trim tool: simple time range input (start/end in seconds), no timeline scrubber in v1

### API Client

```
frontend/src/services/videoApi.ts   # compressVideo, convertVideo, etc.
frontend/src/services/audioApi.ts   # convertAudio
```

Same FormData + progress pattern as `imageApi.ts`.

### Upload Resilience

v1 uses simple multipart upload (no chunked/resumable). Mitigations for unstable networks:
- Upload timeout set to 10 minutes (large files on slow connections)
- Auto-retry on network error: up to 2 retries with exponential backoff
- Resumable/chunked upload deferred to future if user feedback demands it

---

## Tool Registration (DB seed)

| tool_name | category | access_level | credit_cost | daily_limit_anon | daily_limit_auth |
|-----------|----------|-------------|-------------|-----------------|-----------------|
| video/compress | video | auth | 0 | — | 20 |
| video/convert | video | auth | 0 | — | 30 |
| video/to-gif | video | auth | 0 | — | 30 |
| video/extract-audio | video | public | 0 | 10 | 30 |
| video/trim | video | public | 0 | 10 | 30 |
| video/cover | video | public | 0 | 20 | 50 |
| audio/convert | audio | public | 0 | 10 | 30 |

All tools start free (`credit_cost=0`). Can be adjusted later as needed.

---

## Accepted Formats

### Video Input
mp4, mov, avi, mkv, webm, flv, wmv, m4v, 3gp, ts

### Audio Input
mp3, aac, wav, flac, ogg, wma, m4a, opus

### Validation
- Unified validation via `ffprobe` (no `python-magic` dependency):
  ```
  ffprobe -v error -show_format -show_streams -print_format json input_file
  ```
- Single call validates format, extracts codec info, duration, resolution, and bitrate
- If ffprobe exits non-zero or returns no streams, reject the file (corrupted/unsupported)
- Check `codec_name` against supported codec list to catch valid containers with unsupported codecs

---

## Dependencies

### Backend (local)
- `ffmpeg` + `ffprobe` — system packages, installed via `apt-get install ffmpeg`
- No additional Python packages needed (subprocess only)

### Cortex
- `ffmpeg` compiled with `--enable-nvenc --enable-nvdec` for NVIDIA GPU support
- NVIDIA driver + CUDA toolkit (already present for AI inference)

### Docker
- Backend Dockerfile: add `RUN apt-get install -y ffmpeg`
- Cortex Dockerfile: add ffmpeg with NVENC support (use `nvidia/cuda` base or compile)

---

## Implementation Order

1. Backend: `processing/video.py` (local ffmpeg wrapper functions)
2. Backend: `services/video_service.py` (tier routing, FileService integration)
3. Backend: `routers/video.py` (P0 endpoints first: compress + convert)
4. Frontend: `videoApi.ts` + `CompressPage` + `ConvertPage`
5. Cortex: `/v1/ffmpeg` endpoint
6. Backend: wire up Cortex path in VideoService
7. P1 tools (to-gif, extract-audio, trim)
8. P2 tools (audio convert, cover extract)
9. Frontend: remaining pages
