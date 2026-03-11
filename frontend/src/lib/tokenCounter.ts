// --- Model definitions ---

export type AccuracyLevel = 'exact' | 'estimate'

export type ModelDef = {
  id: string
  label: string
  group: string
  accuracy: AccuracyLevel
  accuracyPct: number
  strategy: TokenStrategy
}

type TokenStrategy =
  | { type: 'openai'; encoding: string }
  | { type: 'hf'; fileKey: string }
  | { type: 'heuristic'; family: string }

export const MODELS: ModelDef[] = [
  // OpenAI - exact via gpt-tokenizer (o200k_base)
  { id: 'gpt-4o', label: 'GPT-4o / 4o-mini', group: 'OpenAI', accuracy: 'exact', accuracyPct: 100, strategy: { type: 'openai', encoding: 'o200k_base' } },
  { id: 'gpt-4.1', label: 'GPT-4.1 / 4.5 / 5 / 5.2', group: 'OpenAI', accuracy: 'exact', accuracyPct: 100, strategy: { type: 'openai', encoding: 'o200k_base' } },
  { id: 'o-series', label: 'o1 / o3 / o4-mini', group: 'OpenAI', accuracy: 'exact', accuracyPct: 100, strategy: { type: 'openai', encoding: 'o200k_base' } },
  { id: 'gpt-4', label: 'GPT-4 / 3.5 (legacy)', group: 'OpenAI', accuracy: 'exact', accuracyPct: 100, strategy: { type: 'openai', encoding: 'cl100k_base' } },
  // Anthropic - no public tokenizer
  { id: 'claude', label: 'Claude 3.5 / 4 / 4.5 / 4.6', group: 'Anthropic', accuracy: 'estimate', accuracyPct: 95, strategy: { type: 'heuristic', family: 'claude' } },
  // Google - via Gemma 3 tokenizer (Gemini 2.0/2.5/3/3.1 share the same tokenizer)
  { id: 'gemini', label: 'Gemini 2.0 / 2.5 / 3 / 3.1', group: 'Google', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'gemma-3' } },
  // Meta - Llama family
  { id: 'llama-4', label: 'Llama 4 Scout / Maverick', group: 'Meta', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'llama-4' } },
  { id: 'llama-3', label: 'Llama 3 / 3.1 / 3.2 / 3.3', group: 'Meta', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'llama-3' } },
  // DeepSeek
  { id: 'deepseek', label: 'DeepSeek V3 / R1', group: 'DeepSeek', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'deepseek-v3' } },
  // Alibaba - Qwen family (2.5/3/3.5 share tokenizer)
  { id: 'qwen', label: 'Qwen 2.5 / 3 / 3.5', group: 'Alibaba', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'qwen-2.5' } },
  // Mistral - Tekken tokenizer (Small 3/3.1, Large 3, Nemo)
  { id: 'mistral', label: 'Mistral Small / Large / Nemo', group: 'Mistral', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'mistral-tekken' } },
  // xAI
  { id: 'grok', label: 'Grok 2 / 3', group: 'xAI', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'grok-2' } },
  // Microsoft
  { id: 'phi-4', label: 'Phi-4', group: 'Microsoft', accuracy: 'exact', accuracyPct: 99, strategy: { type: 'hf', fileKey: 'phi-4' } },
]

// --- Caches ---

const openaiEncoderCache = new Map<string, (text: string) => number[]>()
// Typed as unknown to avoid static import of @huggingface/tokenizers
const hfTokenizerCache = new Map<string, unknown>()

// --- OpenAI tokenizer (gpt-tokenizer, dynamic import) ---

async function loadOpenAIEncoder(encoding: string): Promise<(text: string) => number[]> {
  const cached = openaiEncoderCache.get(encoding)
  if (cached) return cached

  let mod: { encode: (text: string) => number[] }
  if (encoding === 'o200k_base') {
    mod = await import('gpt-tokenizer/encoding/o200k_base')
  } else {
    mod = await import('gpt-tokenizer/encoding/cl100k_base')
  }

  openaiEncoderCache.set(encoding, mod.encode)
  return mod.encode
}

// --- HuggingFace tokenizer (tokenizer.json files) ---

async function loadHFTokenizer(fileKey: string) {
  const cached = hfTokenizerCache.get(fileKey)
  if (cached) return cached as { encode: (text: string) => { ids: number[] } }

  const { Tokenizer } = await import('@huggingface/tokenizers')

  const [tokenizerJson, configJson] = await Promise.all([
    fetch(`/tokenizers/${fileKey}.json`).then((r) => r.json()),
    fetch(`/tokenizers/${fileKey}.config.json`).then((r) => r.json()),
  ])

  const tokenizer = new Tokenizer(tokenizerJson, configJson)
  hfTokenizerCache.set(fileKey, tokenizer)
  return tokenizer
}

// --- Heuristic estimation (for models without public tokenizer) ---

const CJK_RE =
  /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}]/gu

const HEURISTIC_RATIOS: Record<string, { latin: number; cjk: number }> = {
  claude: { latin: 3.5, cjk: 1.5 },
}

function estimateTokens(text: string, family: string): number {
  const cjkCount = (text.match(CJK_RE) ?? []).length
  const nonCjkText = text.replace(CJK_RE, '')
  const r = HEURISTIC_RATIOS[family] ?? { latin: 4, cjk: 1.5 }
  return Math.ceil(nonCjkText.length / r.latin + cjkCount / r.cjk)
}

// --- Unified entry point ---

export async function countTokens(text: string, model: ModelDef): Promise<number> {
  if (!text) return 0

  const { strategy } = model

  switch (strategy.type) {
    case 'openai': {
      const encode = await loadOpenAIEncoder(strategy.encoding)
      return encode(text).length
    }
    case 'hf': {
      const tokenizer = await loadHFTokenizer(strategy.fileKey)
      const encoded = tokenizer.encode(text)
      return encoded.ids.length
    }
    case 'heuristic': {
      return estimateTokens(text, strategy.family)
    }
  }
}
