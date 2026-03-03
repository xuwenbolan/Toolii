import { create } from 'zustand'

import { fetchTools, type ToolConfig } from '@/services/toolsApi'

interface ToolState {
  tools: Map<string, ToolConfig>
  loaded: boolean
  loading: boolean

  fetchTools: () => Promise<void>
  isToolEnabled: (name: string) => boolean
  getToolCost: (name: string) => number
  getToolConfig: (name: string) => ToolConfig | undefined
  getToolsByCategory: (category: string) => ToolConfig[]
}

export const useToolStore = create<ToolState>((set, get) => ({
  tools: new Map(),
  loaded: false,
  loading: false,

  fetchTools: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const list = await fetchTools()
      const map = new Map<string, ToolConfig>()
      for (const t of list) {
        map.set(t.tool_name, t)
      }
      set({ tools: map, loaded: true })
    } catch {
      // Silently fail -- tools will appear as enabled by default
    } finally {
      set({ loading: false })
    }
  },

  isToolEnabled: (name: string) => {
    const tool = get().tools.get(name)
    // If not loaded or not found, default to enabled
    return tool?.is_enabled ?? true
  },

  getToolCost: (name: string) => {
    const tool = get().tools.get(name)
    return tool?.credit_cost ?? 0
  },

  getToolConfig: (name: string) => {
    return get().tools.get(name)
  },

  getToolsByCategory: (category: string) => {
    return Array.from(get().tools.values())
      .filter((t) => t.category === category)
      .sort((a, b) => a.display_order - b.display_order)
  },
}))
