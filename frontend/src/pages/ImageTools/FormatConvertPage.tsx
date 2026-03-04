import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import type { FormatPair } from '@/config/formatPairs'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ConvertForm } from './ConvertForm'

type Props = FormatPair

export function FormatConvertPage({ slug, i18nKey, apiFormat, acceptMime }: Props) {
  const { t } = useTranslation('tools')

  return (
    <>
      <SEOHead
        title={t(`${i18nKey}.seoTitle`)}
        description={t(`${i18nKey}.seoDescription`)}
        keywords={t(`${i18nKey}.seoKeywords`)}
        canonicalPath={`/image-tools/${slug}`}
        jsonLd={[buildToolJsonLd({ name: t(`${i18nKey}.seoTitle`), description: t(`${i18nKey}.seoDescription`), url: `/image-tools/${slug}` }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t(`${i18nKey}.title`), path: `/image-tools/${slug}` }])]}
      />
      <ConvertForm
        title={t(`${i18nKey}.title`)}
        description={t(`${i18nKey}.description`)}
        toolName="image/convert"
        fixedFormat={apiFormat as 'jpeg' | 'png' | 'webp'}
        acceptMime={acceptMime}
      />
    </>
  )
}
