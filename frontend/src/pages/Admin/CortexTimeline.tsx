import { useTranslation } from 'react-i18next'

import { DataTable, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CortexModelEvent } from '@/services/adminApi'
import { formatMB, formatEventTime, EVENT_COLORS } from './cortex-helpers'

interface CortexTimelineProps {
  events: CortexModelEvent[]
}

export function CortexTimeline({ events }: CortexTimelineProps) {
  const { t } = useTranslation('console')

  const recentEvents = [...events].reverse().slice(0, 50)

  const eventColumns: Column<CortexModelEvent>[] = [
    {
      key: 'timestamp',
      header: t('system.eventTime'),
      render: (row) => <span className="font-mono text-sm">{formatEventTime(row.timestamp)}</span>,
    },
    {
      key: 'event',
      header: t('system.eventType'),
      render: (row) => (
        <StatusBadge
          status={row.event}
          colorMap={EVENT_COLORS}
          label={t(`system.eventTypes.${row.event}`)}
        />
      ),
    },
    {
      key: 'model',
      header: t('system.eventModel'),
      render: (row) => <span className="font-mono text-sm">{row.model}</span>,
    },
    {
      key: 'vram_before',
      header: t('system.eventVramBefore'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => <span className="text-sm">{formatMB(row.vram_before_mb)}</span>,
    },
    {
      key: 'vram_after',
      header: t('system.eventVramAfter'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => <span className="text-sm">{formatMB(row.vram_after_mb)}</span>,
    },
    {
      key: 'detail',
      header: t('system.eventDetail'),
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.detail || '-'}</span>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('system.modelEvents')}
          {events.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({events.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentEvents.length > 0 ? (
          <DataTable
            columns={eventColumns}
            data={recentEvents}
            rowKey={(row) => `${row.timestamp}-${row.model}-${row.event}`}
          />
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('system.noEvents')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
