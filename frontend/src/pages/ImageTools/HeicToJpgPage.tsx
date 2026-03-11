import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ConvertForm } from './ConvertForm'

export function HeicToJpgPage() {
  const { t } = useTranslation('tools')

  return (
    <>
      <SEOHead
        title={t('heicToJpg.seoTitle')}
        description={t('heicToJpg.seoDescription')}
        keywords={t('heicToJpg.seoKeywords')}
        canonicalPath="/image-tools/heic-to-jpg"
        jsonLd={[buildToolJsonLd({
          name: t('heicToJpg.seoTitle'),
          description: t('heicToJpg.seoDescription'),
          url: '/image-tools/heic-to-jpg',
        }), buildBreadcrumbJsonLd([{ name: t('common:nav.home'), path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('heicToJpg.title'), path: '/image-tools/heic-to-jpg' }])]}
      />
      <ConvertForm
        title={t('heicToJpg.title')}
        description={t('heicToJpg.description')}
        toolName="image/heic-to-jpg"
        fixedFormat="jpeg"
        acceptMime="image/heic,image/heif,.heic,.heif,image/heic-sequence,image/heif-sequence"
      />
    </>
  )
}
