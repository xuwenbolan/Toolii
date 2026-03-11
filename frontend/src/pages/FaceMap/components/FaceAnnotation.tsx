import { useTranslation } from 'react-i18next'

import type { ExtendedVisualization } from '@/services/faceMapApi'
import type { AnnotationLayers } from './AnnotationControls'

type Props = {
  viz: ExtendedVisualization
  imgW: number
  imgH: number
  highlightedFeature?: string | null
  layers?: AnnotationLayers
  onFeatureSelect?: (feature: string | null) => void
  showLockedPaidOverlay?: boolean
}

const DEFAULT_LAYERS: AnnotationLayers = {
  contour: true,
  threeCourts: true,
  fiveEyes: true,
  keyPoints: true,
}

// Maps feature keys to the visualization data they should highlight
const FEATURE_HIGHLIGHT: Record<string, {
  contour?: 'face_contour' | 'nose_contour' | 'mouth_contour' | 'jaw_contour' | 'eyebrow_contours' | 'forehead'
  keyPoints?: string[]
}> = {
  face_shape: { contour: 'face_contour' },
  eyes: { keyPoints: ['left_eye', 'right_eye'] },
  nose: { contour: 'nose_contour', keyPoints: ['nose_tip'] },
  mouth: { contour: 'mouth_contour', keyPoints: ['mouth_center'] },
  eyebrows: { contour: 'eyebrow_contours', keyPoints: ['left_brow', 'right_brow'] },
  forehead: { contour: 'forehead' },
  jawline: { contour: 'jaw_contour', keyPoints: ['chin'] },
  symmetry: { keyPoints: ['left_eye', 'right_eye', 'nose_tip', 'mouth_center'] },
}

const COURT_TOOLTIP_KEYS = [
  'annotation.tooltip.upperCourt',
  'annotation.tooltip.middleCourt',
  'annotation.tooltip.lowerCourt',
] as const

// Annotation color helpers - base values match CSS variables in index.css
const c = (alpha: number) => `oklch(0.59 0.20 264 / ${alpha})`  // --canvas-primary
const stone = (alpha: number) => `oklch(0.55 0.02 75 / ${alpha})`  // neutral stone
const blush = (alpha: number) => `oklch(0.65 0.16 25 / ${alpha})`  // warm blush
const amber = (alpha: number) => `oklch(0.78 0.15 85 / ${alpha})`  // amber hint
const slate = (alpha: number) => `oklch(0.20 0.02 260 / ${alpha})` // dark label bg

export function FaceAnnotation({
  viz,
  imgW: w,
  imgH: h,
  highlightedFeature,
  layers = DEFAULT_LAYERS,
  onFeatureSelect,
  showLockedPaidOverlay = false,
}: Props) {
  const { t } = useTranslation('faceMap')
  const { three_courts, five_eyes, center_x, face_contour } = viz

  const lineColor = c(0.6)
  const textColor = c(0.8)
  const contourColor = c(0.25)
  const highlightColor = c(0.9)

  // Face contour path
  const contourPath = face_contour.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ') + ' Z'

  // Three Courts horizontal lines
  const courtYs = [three_courts.y_hairline, three_courts.y_brow, three_courts.y_nose_base, three_courts.y_chin]

  // Five Eyes vertical lines
  const eyeY = five_eyes.y * h

  const isHighlighting = Boolean(highlightedFeature)
  const baseOpacity = isHighlighting ? 0.2 : 1

  const showAxis = layers.threeCourts || layers.fiveEyes

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Base annotations (dimmed when a feature is highlighted) */}
      <g style={{ opacity: baseOpacity, transition: 'opacity 0.3s ease' }}>
        {/* Face contour */}
        {layers.contour && (
          <path d={contourPath} fill="none" stroke={contourColor} strokeWidth="1.5">
            <title>{t('annotation.tooltip.contour')}</title>
          </path>
        )}

        {/* Center axis */}
        {showAxis && (
          <line
            x1={center_x * w} y1={three_courts.y_hairline * h - 8}
            x2={center_x * w} y2={three_courts.y_chin * h + 8}
            stroke={contourColor} strokeWidth="1" strokeDasharray="4 3"
          />
        )}

        {/* Three Courts lines */}
        {layers.threeCourts && courtYs.map((y, i) => {
          const lineW = w * 0.12
          const lx = center_x * w - lineW
          const rx = center_x * w + lineW
          return (
            <line
              key={`court-${i}`}
              x1={lx} y1={y * h}
              x2={rx} y2={y * h}
              stroke={lineColor} strokeWidth="1.2"
            />
          )
        })}

        {/* Three Courts brackets with tooltips */}
        {layers.threeCourts && (() => {
          const bracketX = center_x * w + w * 0.14
          const segments = [
            { y1: three_courts.y_hairline, y2: three_courts.y_brow },
            { y1: three_courts.y_brow, y2: three_courts.y_nose_base },
            { y1: three_courts.y_nose_base, y2: three_courts.y_chin },
          ]
          return segments.map((seg, i) => (
            <g key={`bracket-${i}`} className="pointer-events-auto cursor-help">
              <title>{t(COURT_TOOLTIP_KEYS[i])}</title>
              {/* Invisible hit area for tooltip */}
              <rect
                x={bracketX - 6}
                y={seg.y1 * h}
                width={12}
                height={(seg.y2 - seg.y1) * h}
                fill="transparent"
              />
              <line x1={bracketX} y1={seg.y1 * h} x2={bracketX} y2={seg.y2 * h} stroke={lineColor} strokeWidth="1" />
              <line x1={bracketX - 3} y1={seg.y1 * h} x2={bracketX + 3} y2={seg.y1 * h} stroke={lineColor} strokeWidth="1" />
              <line x1={bracketX - 3} y1={seg.y2 * h} x2={bracketX + 3} y2={seg.y2 * h} stroke={lineColor} strokeWidth="1" />
            </g>
          ))
        })()}

        {/* Five Eyes vertical lines */}
        {layers.fiveEyes && five_eyes.x_points.map((xp, i) => (
          <line
            key={`eye-${i}`}
            x1={xp * w} y1={eyeY - h * 0.04}
            x2={xp * w} y2={eyeY + h * 0.04}
            stroke={lineColor} strokeWidth="1"
          />
        ))}

        {/* Five Eyes connecting line with tooltip */}
        {layers.fiveEyes && five_eyes.x_points.length >= 2 && (
          <g className="pointer-events-auto cursor-help">
            <title>{t('annotation.tooltip.fiveEyes')}</title>
            {/* Invisible hit area */}
            <rect
              x={five_eyes.x_points[0] * w}
              y={eyeY - h * 0.02}
              width={(five_eyes.x_points[five_eyes.x_points.length - 1] - five_eyes.x_points[0]) * w}
              height={h * 0.04}
              fill="transparent"
            />
            <line
              x1={five_eyes.x_points[0] * w} y1={eyeY}
              x2={five_eyes.x_points[five_eyes.x_points.length - 1] * w} y2={eyeY}
              stroke={lineColor} strokeWidth="0.8" strokeDasharray="3 2"
            />
          </g>
        )}

        {/* Key feature points */}
        {layers.keyPoints && Object.entries(viz.key_points).map(([name, pt]) => (
          <circle
            key={`pt-${name}`}
            cx={pt[0] * w} cy={pt[1] * h} r="2.5"
            fill={textColor}
            opacity="0.6"
          >
            <title>{name}</title>
          </circle>
        ))}
      </g>

      {/* Feature highlight overlay */}
      {highlightedFeature && <HighlightLayer viz={viz} w={w} h={h} feature={highlightedFeature} color={highlightColor} />}

      {/* Clickable face hotspots for quick feature navigation */}
      {onFeatureSelect && (
        <FeatureHotspots
          viz={viz}
          w={w}
          h={h}
          highlightedFeature={highlightedFeature}
          onFeatureSelect={onFeatureSelect}
          t={t}
        />
      )}

      {/* Locked paid-layer preview on user photo (conversion hook) */}
      {!highlightedFeature && showLockedPaidOverlay && (
        <LockedPaidOverlay viz={viz} w={w} h={h} unlockLabel={t('report.unlock')} />
      )}
    </svg>
  )
}

function FeatureHotspots({
  viz,
  w,
  h,
  highlightedFeature,
  onFeatureSelect,
  t,
}: {
  viz: ExtendedVisualization
  w: number
  h: number
  highlightedFeature?: string | null
  onFeatureSelect: (feature: string | null) => void
  t: (key: string) => string
}) {
  const leftEye = viz.key_points.left_eye
  const rightEye = viz.key_points.right_eye
  const nose = viz.key_points.nose_tip
  const mouth = viz.key_points.mouth_center
  const toPath = (pts: [number, number][], close = false) => {
    if (!pts || pts.length === 0) return ''
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ')
    return close ? `${d} Z` : d
  }

  const foreheadPath = viz.forehead?.left && viz.forehead?.top && viz.forehead?.right
    ? toPath([viz.forehead.left, viz.forehead.top, viz.forehead.right], true)
    : ''
  const facePath = toPath(viz.face_contour, true)
  const leftBrowPath = toPath(viz.eyebrow_contours.left)
  const rightBrowPath = toPath(viz.eyebrow_contours.right)
  const nosePath = toPath(viz.nose_contour)
  const mouthPath = toPath(viz.mouth_contour, true)
  const jawPath = toPath(viz.jaw_contour)
  const eyeCy = ((leftEye?.[1] ?? 0.35) + (rightEye?.[1] ?? 0.35)) / 2

  return (
    <g className="pointer-events-auto">
      {/* Click empty area to clear selection */}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill="transparent"
        onClick={() => onFeatureSelect(null)}
      />

      {facePath && (
        <path
          d={facePath}
          fill={highlightedFeature === 'face_shape' ? c(0.12) : 'transparent'}
          stroke={highlightedFeature === 'face_shape' ? c(0.55) : c(0.14)}
          strokeWidth={highlightedFeature === 'face_shape' ? 2 : 1}
          strokeDasharray={highlightedFeature === 'face_shape' ? undefined : '5 4'}
          style={{ cursor: 'pointer' }}
          onClick={() => onFeatureSelect('face_shape')}
        >
          <title>{`${t('features.face_shape')} · ${t('annotation.clickToView')}`}</title>
        </path>
      )}

      {foreheadPath && (
        <path
          d={foreheadPath}
          fill={highlightedFeature === 'forehead' ? c(0.18) : c(0.01)}
          stroke="transparent"
          strokeWidth={2}
          style={{ cursor: 'pointer' }}
          onClick={() => onFeatureSelect('forehead')}
        >
          <title>{`${t('features.forehead')} · ${t('annotation.clickToView')}`}</title>
        </path>
      )}

      {(leftBrowPath || rightBrowPath) && (
        <g onClick={() => onFeatureSelect('eyebrows')} style={{ cursor: 'pointer' }}>
          <title>{`${t('features.eyebrows')} · ${t('annotation.clickToView')}`}</title>
          {leftBrowPath && (
            <>
              <path d={leftBrowPath} fill="none" stroke="transparent" strokeWidth={12} strokeLinecap="round" />
              <path
                d={leftBrowPath}
                fill="none"
                stroke={highlightedFeature === 'eyebrows' ? c(0.45) : c(0.14)}
                strokeWidth={highlightedFeature === 'eyebrows' ? 2.5 : 1.2}
              />
            </>
          )}
          {rightBrowPath && (
            <>
              <path d={rightBrowPath} fill="none" stroke="transparent" strokeWidth={12} strokeLinecap="round" />
              <path
                d={rightBrowPath}
                fill="none"
                stroke={highlightedFeature === 'eyebrows' ? c(0.45) : c(0.14)}
                strokeWidth={highlightedFeature === 'eyebrows' ? 2.5 : 1.2}
              />
            </>
          )}
        </g>
      )}

      {leftEye && rightEye && (
        <g onClick={() => onFeatureSelect('eyes')} style={{ cursor: 'pointer' }}>
          <title>{`${t('features.eyes')} · ${t('annotation.clickToView')}`}</title>
          <ellipse
            cx={leftEye[0] * w}
            cy={eyeCy * h}
            rx={Math.max(12, w * 0.035)}
            ry={Math.max(9, h * 0.022)}
            fill={highlightedFeature === 'eyes' ? c(0.2) : c(0.02)}
            stroke={highlightedFeature === 'eyes' ? c(0.52) : c(0.12)}
            strokeWidth={highlightedFeature === 'eyes' ? 2 : 1}
          />
          <ellipse
            cx={rightEye[0] * w}
            cy={eyeCy * h}
            rx={Math.max(12, w * 0.035)}
            ry={Math.max(9, h * 0.022)}
            fill={highlightedFeature === 'eyes' ? c(0.2) : c(0.02)}
            stroke={highlightedFeature === 'eyes' ? c(0.52) : c(0.12)}
            strokeWidth={highlightedFeature === 'eyes' ? 2 : 1}
          />
        </g>
      )}

      {nosePath && (
        <g onClick={() => onFeatureSelect('nose')} style={{ cursor: 'pointer' }}>
          <title>{`${t('features.nose')} · ${t('annotation.clickToView')}`}</title>
          <path d={nosePath} fill="none" stroke="transparent" strokeWidth={16} strokeLinecap="round" />
          <path
            d={nosePath}
            fill="none"
            stroke={highlightedFeature === 'nose' ? c(0.5) : c(0.14)}
            strokeWidth={highlightedFeature === 'nose' ? 2.4 : 1.2}
            strokeLinecap="round"
          />
          {nose && (
            <circle
              cx={nose[0] * w}
              cy={nose[1] * h}
              r={Math.max(8, w * 0.014)}
              fill={highlightedFeature === 'nose' ? c(0.22) : c(0.04)}
              stroke="transparent"
            />
          )}
        </g>
      )}

      {mouthPath && (
        <g onClick={() => onFeatureSelect('mouth')} style={{ cursor: 'pointer' }}>
          <title>{`${t('features.mouth')} · ${t('annotation.clickToView')}`}</title>
          <path
            d={mouthPath}
            fill={highlightedFeature === 'mouth' ? c(0.18) : c(0.03)}
            stroke={highlightedFeature === 'mouth' ? c(0.46) : c(0.12)}
            strokeWidth={highlightedFeature === 'mouth' ? 2 : 1}
          />
          {mouth && (
            <circle
              cx={mouth[0] * w}
              cy={mouth[1] * h}
              r={Math.max(8, w * 0.014)}
              fill={highlightedFeature === 'mouth' ? c(0.2) : 'transparent'}
              stroke="transparent"
            />
          )}
        </g>
      )}

      {jawPath && (
        <g onClick={() => onFeatureSelect('jawline')} style={{ cursor: 'pointer' }}>
          <title>{`${t('features.jawline')} · ${t('annotation.clickToView')}`}</title>
          <path d={jawPath} fill="none" stroke="transparent" strokeWidth={18} strokeLinecap="round" />
          <path
            d={jawPath}
            fill="none"
            stroke={highlightedFeature === 'jawline' ? c(0.5) : c(0.14)}
            strokeWidth={highlightedFeature === 'jawline' ? 2.5 : 1.2}
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  )
}

// Renders the highlight overlay for a specific feature
function HighlightLayer({
  viz,
  w,
  h,
  feature,
  color,
}: {
  viz: ExtendedVisualization
  w: number
  h: number
  feature: string
  color: string
}) {
  const mapping = FEATURE_HIGHLIGHT[feature]
  if (!mapping) return null

  const elements: React.ReactNode[] = []

  // Render contour highlights
  if (mapping.contour === 'face_contour') {
    const d = viz.face_contour.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ') + ' Z'
    elements.push(
      <path key="face-contour" d={d} fill={color} fillOpacity="0.08" stroke={color} strokeWidth="2.5" />,
    )
  } else if (mapping.contour === 'eyebrow_contours') {
    for (const side of ['left', 'right'] as const) {
      const pts = viz.eyebrow_contours[side]
      if (pts?.length > 0) {
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ')
        elements.push(
          <path key={`brow-${side}`} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />,
        )
      }
    }
  } else if (mapping.contour === 'forehead') {
    const { top, left, right } = viz.forehead
    if (top && left && right) {
      const pts = [top, left, right]
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ') + ' Z'
      elements.push(
        <path key="forehead" d={d} fill={color} fillOpacity="0.08" stroke={color} strokeWidth="2" />,
      )
    }
  } else if (mapping.contour) {
    // Generic contour array (nose_contour, mouth_contour, jaw_contour)
    const pts = viz[mapping.contour] as [number, number][]
    if (pts?.length > 0) {
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ')
      elements.push(
        <path key={mapping.contour} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />,
      )
    }
  }

  // Render key point highlights with pulse animation
  if (mapping.keyPoints) {
    for (const ptKey of mapping.keyPoints) {
      const pt = viz.key_points[ptKey]
      if (pt) {
        elements.push(
          <circle key={`hl-${ptKey}`} cx={pt[0] * w} cy={pt[1] * h} r="5" fill={color} opacity="0.8">
            <animate attributeName="r" values="5;7;5" dur="1.5s" repeatCount="indefinite" media="(prefers-reduced-motion: no-preference)" />
          </circle>,
        )
      }
    }
  }

  if (elements.length === 0) return null

  return (
    <g style={{ transition: 'opacity 0.3s ease' }}>
      {elements}
    </g>
  )
}

function LockedPaidOverlay({
  viz,
  w,
  h,
  unlockLabel,
}: {
  viz: ExtendedVisualization
  w: number
  h: number
  unlockLabel: string
}) {
  const browLeft = viz.eyebrow_contours.left?.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ')
  const browRight = viz.eyebrow_contours.right?.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ')
  const jawPath = viz.jaw_contour?.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ')
  const nosePath = viz.nose_contour?.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0] * w},${p[1] * h}`).join(' ')
  const leftCheek = viz.cheekbones?.left
  const rightCheek = viz.cheekbones?.right

  return (
    <g opacity="0.9">
      <defs>
        <filter id="locked-paid-blur">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>

      <g filter="url(#locked-paid-blur)">
        {/* Contouring shadows */}
        {jawPath && (
          <path
            d={jawPath}
            fill="none"
            stroke={stone(0.45)}
            strokeWidth={Math.max(8, w * 0.012)}
            strokeLinecap="round"
          />
        )}
        {nosePath && (
          <path
            d={nosePath}
            fill="none"
            stroke={stone(0.4)}
            strokeWidth={Math.max(6, w * 0.008)}
            strokeLinecap="round"
          />
        )}

        {/* Blush hints */}
        {leftCheek && (
          <ellipse
            cx={leftCheek[0] * w}
            cy={leftCheek[1] * h}
            rx={Math.max(18, w * 0.045)}
            ry={Math.max(12, h * 0.028)}
            fill={blush(0.35)}
          />
        )}
        {rightCheek && (
          <ellipse
            cx={rightCheek[0] * w}
            cy={rightCheek[1] * h}
            rx={Math.max(18, w * 0.045)}
            ry={Math.max(12, h * 0.028)}
            fill={blush(0.35)}
          />
        )}

        {/* Eyebrow shaping hints */}
        {browLeft && (
          <path
            d={browLeft}
            fill="none"
            stroke={amber(0.55)}
            strokeWidth={Math.max(4, w * 0.006)}
            strokeDasharray="6 5"
            strokeLinecap="round"
          />
        )}
        {browRight && (
          <path
            d={browRight}
            fill="none"
            stroke={amber(0.55)}
            strokeWidth={Math.max(4, w * 0.006)}
            strokeDasharray="6 5"
            strokeLinecap="round"
          />
        )}
      </g>

      {/* Lock badge — sized proportionally to image */}
      {(() => {
        const badgeW = w * 0.22
        const badgeH = badgeW * 0.18
        const radius = badgeH * 0.42
        const fontSize = badgeW * 0.075
        return (
          <g transform={`translate(${w * 0.5}, ${h * 0.9})`}>
            <rect
              x={-badgeW / 2}
              y={-badgeH / 2}
              rx={radius}
              ry={radius}
              width={badgeW}
              height={badgeH}
              fill={slate(0.56)}
            />
            <text
              x={0}
              y={0}
              fill="oklch(1 0 0 / 0.9)"
              fontSize={fontSize}
              textAnchor="middle"
              dominantBaseline="central"
              fontWeight="600"
            >
              {unlockLabel}
            </text>
          </g>
        )
      })()}
    </g>
  )
}
