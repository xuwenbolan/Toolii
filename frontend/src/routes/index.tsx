import { createBrowserRouter } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { RootLayout } from '@/layouts/RootLayout'
import { RedeemPage } from '@/pages/Credits/RedeemPage'
import { ShareClaimPage } from '@/pages/Credits/ShareClaimPage'
import { HomePage } from '@/pages/Home/HomePage'
import { ProcessingHistoryPage } from '@/pages/Dashboard/ProcessingHistoryPage'
import { TransactionHistoryPage } from '@/pages/Dashboard/TransactionHistoryPage'
import { OverviewPage } from '@/pages/Dashboard/OverviewPage'
import { SettingsPage } from '@/pages/Dashboard/SettingsPage'
import { IdPhotoPage } from '@/pages/IdPhoto/IdPhotoPage'
import { BatchProcessPage } from '@/pages/ImageTools/BatchProcessPage'
import { CompressPage } from '@/pages/ImageTools/CompressPage'
import { ConvertPage } from '@/pages/ImageTools/ConvertPage'
import { HeicToJpgPage } from '@/pages/ImageTools/HeicToJpgPage'
import { ImageToolsIndexPage } from '@/pages/ImageTools/ImageToolsIndexPage'
import { MosaicPage } from '@/pages/ImageTools/MosaicPage'
import { ScanEnhancePage } from '@/pages/ImageTools/ScanEnhancePage'
import { ForgotPasswordPage } from '@/pages/Auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/Auth/LoginPage'
import { RegisterPage } from '@/pages/Auth/RegisterPage'
import { ResetPasswordPage } from '@/pages/Auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/Auth/VerifyEmailPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ImagesToPdfPage } from '@/pages/PdfTools/ImagesToPdfPage'
import { PdfCompressPage } from '@/pages/PdfTools/PdfCompressPage'
import { PdfMergePage } from '@/pages/PdfTools/PdfMergePage'
import { PdfPageToolsPage } from '@/pages/PdfTools/PdfPageToolsPage'
import { PdfToolsPage } from '@/pages/PdfTools/PdfToolsPage'
import { PrivacyPolicyPage } from '@/pages/Legal/PrivacyPolicyPage'
import { TermsPage } from '@/pages/Legal/TermsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'id-photo', element: <IdPhotoPage /> },
      { path: 'legal/privacy', element: <PrivacyPolicyPage /> },
      { path: 'legal/terms', element: <TermsPage /> },
      { path: 'share/:token', element: <ShareClaimPage /> },
      {
        path: 'image-tools',
        children: [
          { index: true, element: <ImageToolsIndexPage /> },
          { path: 'compress', element: <CompressPage /> },
          { path: 'heic-to-jpg', element: <HeicToJpgPage /> },
          { path: 'convert', element: <ConvertPage /> },
          { path: 'mosaic', element: <MosaicPage /> },
          { path: 'scan-enhance', element: <ScanEnhancePage /> },
          { path: 'batch', element: <BatchProcessPage /> },
        ],
      },
      {
        path: 'pdf-tools',
        children: [
          { index: true, element: <PdfToolsPage /> },
          { path: 'compress', element: <PdfCompressPage /> },
          { path: 'merge', element: <PdfMergePage /> },
          { path: 'pages', element: <PdfPageToolsPage /> },
          { path: 'from-images', element: <ImagesToPdfPage /> },
        ],
      },
      {
        path: 'auth',
        element: <AuthLayout />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'verify-email', element: <VerifyEmailPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
        ],
      },
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'transactions', element: <TransactionHistoryPage /> },
          { path: 'history', element: <ProcessingHistoryPage /> },
          { path: 'redeem', element: <RedeemPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
