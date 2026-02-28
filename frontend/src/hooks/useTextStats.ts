import { useEffect, useRef, useState } from 'react'

import { computeTextStats, type TextStats } from '@/lib/textCounter'
import { countTokens, MODELS, type ModelDef } from '@/lib/tokenCounter'

export type TokenResult = {
  count: number
  loading: boolean
  model: ModelDef
}

const DEBOUNCE_MS = 300

export function useTextStats(text: string, modelId: string) {
  const [stats, setStats] = useState<TextStats>(() => computeTextStats(''))
  const [tokens, setTokens] = useState<TokenResult>({
    count: 0,
    loading: false,
    model: MODELS[0],
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const seqRef = useRef(0)

  // Text stats: synchronous, immediate
  useEffect(() => {
    setStats(computeTextStats(text))
  }, [text])

  // Token counting: debounced
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]

    if (!text) {
      setTokens({ count: 0, loading: false, model })
      return
    }

    setTokens((prev) => ({ ...prev, loading: true, model }))
    const seq = ++seqRef.current

    debounceRef.current = setTimeout(async () => {
      try {
        const count = await countTokens(text, model)
        // Only apply if this is still the latest request
        if (seq === seqRef.current) {
          setTokens({ count, loading: false, model })
        }
      } catch {
        if (seq === seqRef.current) {
          setTokens({ count: 0, loading: false, model })
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [text, modelId])

  return { stats, tokens }
}
