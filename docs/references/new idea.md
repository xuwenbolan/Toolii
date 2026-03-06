# Toolii 工具集成参考手册

> 整理自完整对话中提到的所有工具、库和技术，按类别和优先级组织。
>
> 技术栈：Python 3.13 + FastAPI / React 18 + TypeScript / Docker 三容器架构 / RTX 4070 Ti

---

## 一、系统级 CLI 工具（apt install / 二进制下载）

这些工具通过 Python 的 `subprocess` 调用，一个工具就能撑起一整个功能分类。

### 1.1 FFmpeg — 音视频万能工具

- **安装**：`apt install ffmpeg`
- **能力**：视频转码、音频提取、格式转换、剪辑、合并、加字幕、生成 GIF、推流
- **可做的工具**：视频转 GIF、视频压缩、音频格式转换（MP3/WAV/AAC/FLAC）、提取视频音轨、视频截图、视频裁剪拼接
- **备注**：几乎所有视频播放器、浏览器、流媒体服务背后都在用 FFmpeg 的库。命令行参数复杂但功能无限

### 1.2 LibreOffice Headless — 办公文档格式转换之王

- **安装**：`apt install libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress`
- **用法**：`libreoffice --headless --convert-to pdf input.docx`
- **支持格式**：DOCX、DOC、XLSX、XLS、PPTX、PPT、ODT、ODS、ODP、RTF、CSV、HTML 互转
- **可做的工具**：Word 转 PDF、PDF 转 Word、Excel 转 PDF、PPT 转 PDF、各种办公格式互转
- **注意**：LibreOffice 单线程，并发需用任务队列或多实例；Docker 中需安装中文字体包（fonts-noto-cjk）

### 1.3 Pandoc — 标记语言文档转换之王

- **安装**：`apt install pandoc`
- **能力**：Markdown、LaTeX、Word、HTML、PDF、EPUB 等几十种格式互转
- **可做的工具**：Markdown 转 Word、Word 转 Markdown、Markdown 转 PDF（需 LaTeX）、EPUB 转 PDF
- **定位**：与 LibreOffice 互补——Pandoc 擅长标记语言互转，LibreOffice 擅长 Office 格式互转

### 1.4 ImageMagick — 图片处理 200+ 操作

- **安装**：`apt install imagemagick`
- **独特能力**（Pillow/OpenCV 不易实现的）：
  - `magick convert input.pdf output-%d.png` — PDF 每页转高质量图片
  - `magick montage *.jpg -geometry +2+2 collage.jpg` — 多图拼贴
  - `magick compare a.png b.png diff.png` — 图片差异对比
  - 艺术滤镜：`-charcoal`（素描）、`-paint`（油画）、`-sketch`（铅笔画）、`-swirl`（漩涡）、`-polaroid`（宝丽来相框）、`-vignette`（暗角）
- **可做的工具**：一键变素描、油画风格、宝丽来效果、图片拼贴、图片对比

### 1.5 Potrace — 位图转矢量 SVG

- **安装**：`apt install potrace`
- **用法**：`potrace input.bmp -b svg -o output.svg`
- **可做的工具**：图片转 SVG、Logo 矢量化
- **备注**：配合 Pillow/OpenCV 做预处理（二值化、边缘检测）效果更好。设计师从网上扒的 PNG logo 想转成可编辑 SVG 时很需要

### 1.6 Graphviz — 文本转图表

- **安装**：`apt install graphviz`
- **用法**：`echo 'digraph { A -> B -> C }' | dot -Tpng -o graph.png`
- **可做的工具**：在线流程图生成器（用户输入文字描述关系，后端渲染成 PNG/SVG）

### 1.7 Mermaid CLI (mmdc) — 现代图表渲染

- **安装**：`npm install -g @mermaid-js/mermaid-cli`（Docker 里需装 Node.js）
- **用法**：`mmdc -i input.mmd -o output.png`
- **支持**：流程图、时序图、甘特图、ER 图、饼图等
- **可做的工具**：Mermaid 转图片（程序员和写文档的人常用）

### 1.8 ExifTool — 元数据读写清除

- **安装**：`apt install libimage-exiftool-perl`
- **用法**：
  - `exiftool -all= photo.jpg` — 清除所有元数据（隐私保护）
  - `exiftool -json photo.jpg` — JSON 输出所有元数据
  - `exiftool -GPSLatitude photo.jpg` — 提取 GPS 信息
- **可做的工具**：查看照片拍摄信息、一键清除隐私数据（GPS、设备信息）
- **备注**：支持几乎所有图片、视频、音频、PDF 格式，比 Python 的任何 EXIF 库都强

### 1.9 Gifsicle — GIF 专用工具

- **安装**：`apt install gifsicle`
- **用法**：
  - `gifsicle --optimize=3 --lossy=80 input.gif -o output.gif` — 压缩
  - `gifsicle --resize 320x240 input.gif -o output.gif` — 缩放
  - `gifsicle --unoptimize input.gif | gifsicle --delay=10 -o output.gif` — 改速度
- **可做的工具**：GIF 压缩、GIF 调速、GIF 裁剪

### 1.10 图片压缩专用工具

| 工具 | 安装 | 用途 |
|------|------|------|
| **pngquant** | `apt install pngquant` | 有损 PNG 压缩，减 60-80% 体积，肉眼几乎无差 |
| **OptiPNG** | `apt install optipng` | 无损 PNG 优化 |
| **jpegoptim** | `apt install jpegoptim` | JPEG 优化压缩 |
| **cjxl** | libjxl 工具 | 转换为 JPEG XL 最新格式 |

### 1.11 wkhtmltopdf / wkhtmltoimage — 网页截图与转换

- **安装**：`apt install wkhtmltopdf`
- **用法**：
  - `wkhtmltoimage https://example.com screenshot.png`
  - `wkhtmltopdf https://example.com page.pdf`
- **可做的工具**：网页截图、网页转 PDF

### 1.12 yt-dlp — 视频信息提取

- **安装**：`pip install yt-dlp` 或下载二进制
- **工具站用途**：信息提取（非下载）
  - `yt-dlp --dump-json "URL"` — 提取视频标题、描述、缩略图、时长、字幕
- **可做的工具**：视频信息提取、视频缩略图下载

### 1.13 steghide — 图片隐写术

- **安装**：`apt install steghide`
- **用法**：
  - `steghide embed -cf cover.jpg -ef secret.txt` — 把文字藏进图片
  - `steghide extract -sf cover.jpg` — 从图片提取隐藏信息
- **可做的工具**：图片隐写——把秘密消息藏进图片里（趣味性强，自带传播性）

### 1.14 figlet / toilet — ASCII 大字生成

- **安装**：`apt install figlet toilet`
- **用法**：`figlet "Hello World"`
- **可做的工具**：ASCII 文字艺术生成器（选字体、生成可粘贴的 ASCII 大字）

### 1.15 QRencode — 二维码生成

- **安装**：`apt install qrencode`
- **用法**：`qrencode -o qr.png -s 10 -l H "https://toolii.com"`
- **备注**：比 Python qrcode 库功能更丰富，配合 ImageMagick 可做彩色二维码和嵌入 logo

---

## 二、Go 语言 CLI 工具（下载预编译二进制）

### 2.1 primitive — 几何艺术生成

- **来源**：github.com/fogleman/primitive
- **用法**：`primitive -i input.jpg -o output.png -n 200 -m 1`
- **效果**：用三角形、圆形、矩形逐步逼近原图，生成 Low Poly 风格艺术化效果
- **可做的工具**：图片转几何艺术、Low Poly 风格生成器
- **备注**：200 个三角形拼出的人像非常惊艳，用户看到就想试

### 2.2 ascii-image-converter — 图片转 ASCII 艺术

- **来源**：github.com/TheZoraiz/ascii-image-converter
- **用法**：
  - `ascii-image-converter input.jpg --color --save-img output.png`
  - `ascii-image-converter input.jpg --braille --color --save-img output.png`（Braille 点阵）
- **可做的工具**：图片转 ASCII 艺术、图片转 Braille 点阵艺术
- **备注**：支持彩色输出和保存为图片，用户会主动分享到社交媒体

---

## 三、Python 库（pip install）

### 3.1 AI / 语音方向（cortex 容器，GPU 推理）

#### faster-whisper — 语音转文字

- **安装**：`pip install faster-whisper`
- **简介**：OpenAI Whisper 的 CTranslate2 重实现，比原版快 4 倍，内存占用更少，支持 int8 量化
- **可做的工具**：音频/视频转文字、字幕生成、多语言语音识别、会议录音转写
- **备注**：RTX 4070 Ti 跑 large-v3-turbo 绑绑有余。"语音转文字"竞品大多付费

#### WhisperX — faster-whisper 进阶版

- **安装**：`pip install whisperx`
- **进阶能力**：70 倍实时速度批量推理、精确到词级别的时间戳、多说话人识别（说话人分离）
- **可做的工具**：带时间轴的字幕生成、多人会议纪要
- **备注**：做字幕生成的话，WhisperX 出来的效果直接就能用

#### Marker — 文档智能解析

- **安装**：`pip install marker-pdf`
- **能力**：PDF、图片、PPTX、DOCX、XLSX、HTML、EPUB 转 Markdown/JSON/HTML，正确处理表格、公式、代码块，支持所有语言
- **自带 FastAPI 服务**：`marker_server --port 8001`
- **可做的工具**：PDF 转 Markdown、PDF 表格提取、扫描件 OCR 转结构化文本、万能文档转 Markdown

#### Docling（IBM）— Marker 的替代方案

- **安装**：`pip install docling`
- **能力**：PDF、DOCX、PPTX、图片、HTML、AsciiDoc 转 Markdown/JSON，用 IBM TableFormer 做表格提取
- **特点**：三行代码即用、支持本地执行（数据隐私）、LangChain/LlamaIndex 原生集成
- **定位**：表格提取比 Marker 更强，适合未来做 RAG / AI 文档问答

### 3.2 音频处理

#### pydub — FFmpeg 的 Python 高级封装

- **安装**：`pip install pydub`（依赖 FFmpeg）
- **能力**：音频格式转换、剪切、拼接、调音量、淡入淡出、混音，API 极简
- **示例**：`AudioSegment.from_mp3("input.mp3").export("output.wav", format="wav")`
- **可做的工具**：音频格式转换、音频剪辑、音频合并

### 3.3 图像 / 设计辅助

#### CairoSVG — SVG 转换

- **安装**：`pip install cairosvg`
- **能力**：SVG 转 PNG、PDF、PS，纯 Python
- **可做的工具**：SVG 转 PNG（设计师需要发到不支持 SVG 的平台时）

#### fonttools — 字体格式互转

- **安装**：`pip install fonttools[woff]`
- **能力**：TTF、OTF、WOFF、WOFF2 之间互转
- **可做的工具**：字体格式转换（下载的字体格式不对、需要转成网页字体 WOFF2）
- **备注**：设计师高频需求，竞品少

#### colorthief — 图片取色

- **安装**：`pip install colorthief`
- **用法**：`ColorThief('image.jpg').get_palette(color_count=6)`
- **可做的工具**：图片取色、从图片生成配色方案

#### img2pdf — 图片无损转 PDF

- **安装**：`pip install img2pdf`
- **特点**：直接把 JPEG 流嵌入 PDF，零质量损失，速度极快（区别于 reportlab 的重新编码）
- **可做的工具**：图片转 PDF（搜索量非常大）

#### WeasyPrint — HTML/CSS 转精美 PDF

- **安装**：`pip install weasyprint`
- **特点**：支持完整 CSS 布局，渲染效果比 reportlab 漂亮很多
- **可做的工具**：网页转 PDF、Markdown 转精美 PDF

#### pillow-avif-plugin — AVIF 格式支持

- **安装**：`pip install pillow-avif-plugin`
- **备注**：配合已有的 pillow-heif 覆盖所有现代图片格式
- **可做的工具**：AVIF 转 PNG、WebP 转 JPG 等格式转换

### 3.4 二维码 / 条形码

#### segno — 现代二维码生成

- **安装**：`pip install segno`
- **特点**：比 qrcode 库更好，支持 Micro QR、彩色 QR、SVG/PNG/EPS 输出
- **可做的工具**：二维码生成器

#### pyzbar — 条形码 / 二维码识别

- **安装**：`pip install pyzbar`
- **能力**：识别各种条形码和二维码
- **可做的工具**：二维码识别、条形码扫描

#### python-barcode — 条形码生成

- **安装**：`pip install python-barcode`
- **能力**：生成 EAN、UPC、Code128 等各种条形码
- **可做的工具**：条形码生成器

### 3.5 Office 文档内容操作

| 库 | 安装 | 用途 |
|---|---|---|
| **python-docx** | `pip install python-docx` | 创建和修改 Word 文档（加水印、合并、提取文本） |
| **python-pptx** | `pip install python-pptx` | 创建和修改 PPT（提取文本/图片、模板填充） |
| **openpyxl** | `pip install openpyxl` | 读写 Excel（合并表格、数据提取、格式转换） |

### 3.6 隐写术（Python 版）

#### stegano — 图片隐写

- **安装**：`pip install stegano`
- **备注**：steghide 的 Python 替代方案，纯 Python 实现，无需外部二进制

---

## 四、Toolii 已有能力一览

| 层 | 技术 |
|---|---|
| **图片处理** | Pillow + OpenCV + pillow-heif (HEIC) |
| **AI 去背景** | rembg |
| **AI 人脸** | MediaPipe + ONNX Runtime (FaceNet512) |
| **AI 超分辨率** | Real-ESRGAN |
| **AI 人脸修复** | GFPGAN |
| **AI 去噪** | NAFNet |
| **AI 上色** | DDColor |
| **AI 消除** | LaMa |
| **AI OCR** | RapidOCR |
| **AI 分割** | MobileSAM |
| **AI 去背景（高精度）** | BiRefNet |
| **PDF** | pikepdf + PyPDF2 + reportlab |
| **认证** | PyJWT + Google OAuth + bcrypt |
| **GPU 推理** | RTX 4070 Ti + ONNX Runtime GPU |

---

## 五、优先级排序建议

### P0 — 最高 ROI，一装顶一个分类

| 工具 | 装在哪 | 可做的工具 | 理由 |
|------|--------|-----------|------|
| LibreOffice Headless | backend 容器 | 办公文档格式互转 | 搜索量巨大 |
| FFmpeg + pydub | backend 容器 | 音视频转换/压缩/剪辑/转GIF | 同上 |
| faster-whisper | cortex 容器 | 语音转文字、视频字幕 | GPU 利用率高，竞品少 |

### P1 — 开发快、需求大

| 工具 | 装在哪 | 可做的工具 |
|------|--------|-----------|
| segno + pyzbar | backend | 二维码/条形码 生成+识别 |
| img2pdf | backend | 图片无损转 PDF |
| CairoSVG | backend | SVG 转 PNG/PDF |
| fonttools | backend | 字体格式互转 |
| ExifTool | backend | 图片元数据查看/清除 |
| pngquant + jpegoptim | backend | 专业级图片压缩 |
| Gifsicle | backend | GIF 压缩/编辑/调速 |
| ImageMagick | backend | 图片拼贴/对比/艺术滤镜 |

### P2 — 差异化和进阶功能

| 工具 | 装在哪 | 可做的工具 |
|------|--------|-----------|
| Potrace | backend | 位图转矢量 SVG |
| colorthief | backend | 图片取色/配色方案 |
| WeasyPrint | backend | HTML/Markdown 转精美 PDF |
| Pandoc | backend | 标记语言文档互转 |
| Graphviz / Mermaid CLI | backend | 文本转图表 |
| Marker / Docling | cortex | 智能文档解析 |
| wkhtmltopdf | backend | 网页截图/转 PDF |
| WhisperX | cortex | 带说话人分离的字幕 |

### P3 — 有趣工具（自带传播性）

| 工具 | 装在哪 | 可做的工具 |
|------|--------|-----------|
| primitive | backend | 几何艺术 / Low Poly 风格生成 |
| ascii-image-converter | backend | 图片转 ASCII / Braille 艺术 |
| steghide / stegano | backend | 图片隐写术 |
| ImageMagick 创意效果 | backend | 素描/油画/宝丽来/漩涡等效果 |
| figlet | backend | ASCII 大字生成 |
| python-docx/pptx/openpyxl | backend | 文档内容编辑操作 |
| pillow-avif-plugin | backend | AVIF 格式支持 |

---

## 六、前端生态参考（非 Toolii 主技术栈，仅做了解）

以下是对话中提到的纯前端 / Node.js 方案，Toolii 的 Python 后端架构不直接使用，但作为行业参考记录。

| 库 | 说明 |
|---|---|
| **FFmpeg.wasm** | FFmpeg 编译为 WebAssembly，纯浏览器端音视频处理 |
| **wasm-vips** | libvips 的 WASM 版，浏览器端图片处理 |
| **Photon** | Rust/WASM 图片处理库，96 个效果函数 |
| **squoosh-browser** | Google Squoosh 的可集成浏览器版，支持 AVIF/JXL |
| **Transformers.js v4** | Hugging Face 的浏览器端 AI（2026.2 发布，WebGPU 加速） |
| **@imgly/background-removal** | 纯前端 AI 去背景（ONNX Runtime Web） |
| **@bunnio/rembg-web** | rembg 的 JS 移植版，支持 WebGPU |
| **Tesseract.js** | OCR 引擎的 JS 版，100+ 语言 |
| **pdf-lib** | 纯 JS 的 PDF 操作（合并/拆分/水印） |
| **SheetJS (xlsx)** | 纯 JS 读写 Excel/CSV |
| **Sharp** | Node.js 图片处理库（底层 libvips） |
| **qrcode + jsQR** | 纯前端二维码生成 + 识别 |
| **CryptoJS / Web Crypto API** | 浏览器端加密/哈希 |

---

## 七、对话中提到的其他通用 CLI 工具

这些工具在对话前半段作为"有趣的命令行工具"介绍，非 Toolii 集成目标，但作为知识参考记录。

| 工具 | 说明 |
|---|---|
| **curl** | 支持几十种协议的网络请求工具，调试 API 的神器 |
| **httpie** | 比 curl 更人性化的 HTTP 客户端，输出自动高亮 |
| **mtr** | ping + traceroute 合一，实时显示每一跳丢包和延迟 |
| **ripgrep (rg)** | Rust 写的 grep 替代品，搜代码极快 |
| **fzf** | 模糊搜索工具，可接管 Ctrl+R 历史搜索 |
| **jq** | 命令行 JSON 处理工具（Ubuntu: `apt install jq`） |
| **btop** | 终端里的系统监控仪表盘 |
| **dust** | du 的替代品，树状图可视化磁盘占用 |
| **tmux** | 终端复用器，SSH 断开后会话不丢失 |
| **zoxide** | cd 的智能替代，记住常去目录 |
| **aria2** | 多协议多连接下载工具，支持 HTTP/FTP/BT/Metalink |

---

## 八、关键技术趋势（2025-2026）

1. **WebAssembly 成熟**：FFmpeg、libvips、Whisper 等重量级工具都有了 WASM 版本，纯前端处理变得可行
2. **WebGPU 普及**：Transformers.js v4 + WebGPU 让浏览器端 AI 推理获得接近原生的性能
3. **语音 AI 平民化**：faster-whisper / WhisperX 让语音转文字在消费级 GPU 上高效运行
4. **文档智能化**：Marker / Docling 代表了新一代 AI 驱动的文档解析能力
5. **隐私优先**：纯前端处理 + 本地 AI 推理成为工具站的差异化卖点