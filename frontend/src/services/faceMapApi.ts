import type { AxiosProgressEvent } from 'axios'

import { api } from '@/services/api'

// --- Visualization ---

export type VisualizationThreeCourts = {
  y_hairline: number
  y_brow: number
  y_nose_base: number
  y_chin: number
}

export type VisualizationFiveEyes = {
  y: number
  x_points: number[]
}

export type ExtendedVisualization = {
  three_courts: VisualizationThreeCourts
  five_eyes: VisualizationFiveEyes
  center_x: number
  face_contour: [number, number][]
  key_points: Record<string, [number, number]>
  eyebrow_contours: { left: [number, number][]; right: [number, number][] }
  nose_contour: [number, number][]
  mouth_contour: [number, number][]
  jaw_contour: [number, number][]
  forehead: { top: [number, number]; left: [number, number]; right: [number, number] }
  cheekbones: { left: [number, number]; right: [number, number] }
  ipd_pixels: number
}

// --- Feature reading ---

export type FeatureReading = {
  label: string
  score: number
  description: string
  beauty_tip: string | null
  secondary_label?: string
  secondary_confidence?: number
}

// --- Aesthetics dimensions ---

export type DimensionBasisItem = {
  key: string
  value: string | number
  ideal?: string | number | null
}

export type AestheticsDimension = {
  id: string
  label: string
  score: number
  percentile: number
  description?: string
  basis?: DimensionBasisItem[]
}

// --- Fun indices ---

export type FunIndex = {
  id: string
  label: string
  percentile: number
  description: string
}

// --- Gene card ---

export type GeneCard = {
  description: string
  highlights: string[]
}

// --- Photo angle ---

export type PhotoAngleResult = {
  best_side: string
  vertical_angle: string
  expression_tip: string
  rationale: string
}

// --- Hairstyle ---

export type HairstyleRecommendation = {
  style_id: string
  name: string
  rationale: string
  forehead_exposure: number
}

export type HairstyleResult = {
  recommended: HairstyleRecommendation[]
  avoid: HairstyleRecommendation[]
}

// --- Eyebrow ---

export type EyebrowSuggestion = {
  current_type: string
  current_description: string
  suggested_type: string
  suggested_description?: string
  rationale: string
  adjustments: Record<string, string>
}

// --- Contouring ---

export type ContouringZone = {
  region_id: string
  zone_type: string
  tip: string
}

export type ContouringResult = {
  zones: ContouringZone[]
  description: string
}

// --- Glasses ---

export type GlassesRecommendation = {
  frame_id: string
  name: string
  rationale: string
}

export type GlassesResult = {
  recommended: GlassesRecommendation[]
  avoid: GlassesRecommendation[]
}

// --- Insights ---

export type InsightItem = {
  type: string
  title: string
  brief: string
  detail: string
}

// --- Profile response (free tier) ---

export type FaceProfileResponse = {
  gene_card: GeneCard
  overall_score: number
  dimensions: AestheticsDimension[]
  fun_indices: FunIndex[]
  tags: string[]
  features: Record<string, FeatureReading>
  summary: string
  photo_angle: PhotoAngleResult
  visualization?: ExtendedVisualization | null
  disclaimer: string
}

// --- Full report response (paid tier) ---

export type FullReportResponse = {
  profile: FaceProfileResponse
  hairstyles: HairstyleResult
  eyebrows: EyebrowSuggestion
  contouring: ContouringResult
  glasses: GlassesResult
  insights: InsightItem[]
  physiognomy_narrative: string
  physiognomy_sections: Record<string, string>
  llm_used: boolean
}

// --- API calls ---

export async function analyzeFaceProfile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FaceProfileResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await api.post<FaceProfileResponse>('/api/facemap/profile', fd, {
    onUploadProgress: onProgress
      ? (evt: AxiosProgressEvent) => {
          const total = evt.total ?? file.size
          if (total) onProgress((evt.loaded / total) * 100)
        }
      : undefined,
  })
  return res.data
}

export async function analyzeFaceReport(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FullReportResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await api.post<FullReportResponse>('/api/facemap/report', fd, {
    onUploadProgress: onProgress
      ? (evt: AxiosProgressEvent) => {
          const total = evt.total ?? file.size
          if (total) onProgress((evt.loaded / total) * 100)
        }
      : undefined,
  })
  return res.data
}

// --- Face similarity types ---

export type RegionScore = {
  region: string
  score: number
  description: string | null
  rank?: number | null
  badge?: string | null
}

export type FaceSimilarityResponse = {
  regions: RegionScore[]
  overall_score: number
  title: string
  summary: string
  disclaimer: string
  narrative?: string | null
  fun_facts?: string[] | null
  best_region?: string | null
  worst_region?: string | null
}

// --- Face similarity API call ---

export async function compareFaces(
  file1: File,
  file2: File,
  onProgress?: (percent: number) => void,
): Promise<FaceSimilarityResponse> {
  const fd = new FormData()
  fd.append('file1', file1)
  fd.append('file2', file2)
  const res = await api.post<FaceSimilarityResponse>('/api/facemap/similarity', fd, {
    onUploadProgress: onProgress
      ? (evt: AxiosProgressEvent) => {
          const total = evt.total ?? (file1.size + file2.size)
          if (total) onProgress((evt.loaded / total) * 100)
        }
      : undefined,
  })
  return res.data
}

