import api from './api'

// -- Public API types --

export interface ToolConfig {
  tool_name: string
  category: string
  is_enabled: boolean
  credit_cost: number
  display_order: number
  display_name: string | null
  description: string | null
  icon: string | null
  access_level: string
  daily_limit: number | null
}

interface ToolListResponse {
  tools: ToolConfig[]
}

export async function fetchTools(): Promise<ToolConfig[]> {
  const { data } = await api.get<ToolListResponse>('/api/tools')
  return data.tools
}

// -- Admin API types --

export interface AdminToolItem {
  tool_name: string
  category: string
  display_order: number
  is_enabled: boolean
  credit_cost: number
  display_name_zh: string | null
  display_name_en: string | null
  description_zh: string | null
  description_en: string | null
  icon: string | null
  access_level: string
  daily_limit_anon: number | null
  daily_limit_auth: number | null
  created_at: string
  updated_at: string
}

interface AdminToolListResponse {
  tools: AdminToolItem[]
}

export interface AdminToolUpdateRequest {
  is_enabled?: boolean
  credit_cost?: number
  display_order?: number
  display_name_zh?: string | null
  display_name_en?: string | null
  description_zh?: string | null
  description_en?: string | null
  icon?: string | null
  access_level?: string
  daily_limit_anon?: number | null
  daily_limit_auth?: number | null
}

export async function fetchAdminTools(): Promise<AdminToolItem[]> {
  const { data } = await api.get<AdminToolListResponse>('/api/admin/tools')
  return data.tools
}

export async function updateAdminTool(
  toolName: string,
  updates: AdminToolUpdateRequest,
): Promise<AdminToolItem> {
  const { data } = await api.put<AdminToolItem>(
    `/api/admin/tools/${toolName}`,
    updates,
  )
  return data
}
