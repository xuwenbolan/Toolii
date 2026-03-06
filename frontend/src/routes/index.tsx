import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AdminRoute } from '@/components/auth/AdminRoute'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { FORMAT_PAIRS } from '@/config/formatPairs'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ConsoleLayout } from '@/layouts/ConsoleLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { RootLayout } from '@/layouts/RootLayout'
import { NotFoundPage } from '@/pages/NotFoundPage'

const HomePage = lazy(() => import('@/pages/Home/HomePage').then((m) => ({ default: m.HomePage })))
const IdPhotoPage = lazy(() => import('@/pages/IdPhoto/IdPhotoPage').then((m) => ({ default: m.IdPhotoPage })))
const FaceMapPage = lazy(() => import('@/pages/FaceMap/FaceMapPage').then((m) => ({ default: m.FaceMapPage })))
const FaceSimilarityPage = lazy(() => import('@/pages/FaceSimilarity/FaceSimilarityPage').then((m) => ({ default: m.FaceSimilarityPage })))
const ResultSharePage = lazy(() => import('@/pages/ResultShare/ResultSharePage').then((m) => ({ default: m.ResultSharePage })))
const PrivacyPolicyPage = lazy(() => import('@/pages/Legal/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })))
const TermsPage = lazy(() => import('@/pages/Legal/TermsPage').then((m) => ({ default: m.TermsPage })))
const ShareClaimPage = lazy(() => import('@/pages/Credits/ShareClaimPage').then((m) => ({ default: m.ShareClaimPage })))

const ImageToolsIndexPage = lazy(() => import('@/pages/ImageTools/ImageToolsIndexPage').then((m) => ({ default: m.ImageToolsIndexPage })))
const CompressPage = lazy(() => import('@/pages/ImageTools/CompressPage').then((m) => ({ default: m.CompressPage })))
const HeicToJpgPage = lazy(() => import('@/pages/ImageTools/HeicToJpgPage').then((m) => ({ default: m.HeicToJpgPage })))
const ConvertPage = lazy(() => import('@/pages/ImageTools/ConvertPage').then((m) => ({ default: m.ConvertPage })))
const MosaicPage = lazy(() => import('@/pages/ImageTools/MosaicPage').then((m) => ({ default: m.MosaicPage })))
const ScanEnhancePage = lazy(() => import('@/pages/ImageTools/ScanEnhancePage').then((m) => ({ default: m.ScanEnhancePage })))
const RemoveBgPage = lazy(() => import('@/pages/ImageTools/RemoveBgPage').then((m) => ({ default: m.RemoveBgPage })))
const FormatConvertPage = lazy(() => import('@/pages/ImageTools/FormatConvertPage').then((m) => ({ default: m.FormatConvertPage })))
const UpscalePage = lazy(() => import('@/pages/ImageTools/UpscalePage').then((m) => ({ default: m.UpscalePage })))
const RestoreFacePage = lazy(() => import('@/pages/ImageTools/RestoreFacePage').then((m) => ({ default: m.RestoreFacePage })))
const DenoisePage = lazy(() => import('@/pages/ImageTools/DenoisePage').then((m) => ({ default: m.DenoisePage })))
const ColorizePage = lazy(() => import('@/pages/ImageTools/ColorizePage').then((m) => ({ default: m.ColorizePage })))
const InpaintPage = lazy(() => import('@/pages/ImageTools/InpaintPage').then((m) => ({ default: m.InpaintPage })))
const OcrPage = lazy(() => import('@/pages/ImageTools/OcrPage').then((m) => ({ default: m.OcrPage })))
const SegmentPage = lazy(() => import('@/pages/ImageTools/SegmentPage').then((m) => ({ default: m.SegmentPage })))

const PdfToolsPage = lazy(() => import('@/pages/PdfTools/PdfToolsPage').then((m) => ({ default: m.PdfToolsPage })))

const TextToolsIndexPage = lazy(() => import('@/pages/TextTools/TextToolsIndexPage').then((m) => ({ default: m.TextToolsIndexPage })))
const WordCounterPage = lazy(() => import('@/pages/TextTools/WordCounterPage').then((m) => ({ default: m.WordCounterPage })))

const TransferCreatePage = lazy(() => import('@/pages/Transfer/TransferCreatePage').then((m) => ({ default: m.TransferCreatePage })))
const TransferReceivePage = lazy(() => import('@/pages/Transfer/TransferReceivePage').then((m) => ({ default: m.TransferReceivePage })))
const TransferListPage = lazy(() => import('@/pages/Transfer/TransferListPage').then((m) => ({ default: m.TransferListPage })))
const HubFilesPage = lazy(() => import('@/pages/Dashboard/HubFilesPage').then((m) => ({ default: m.HubFilesPage })))

const LoginPage = lazy(() => import('@/pages/Auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/Auth/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const VerifyEmailPage = lazy(() => import('@/pages/Auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/Auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/Auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))

const OverviewPage = lazy(() => import('@/pages/Dashboard/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const TransactionHistoryPage = lazy(() => import('@/pages/Dashboard/TransactionHistoryPage').then((m) => ({ default: m.TransactionHistoryPage })))
const ProcessingHistoryPage = lazy(() => import('@/pages/Dashboard/ProcessingHistoryPage').then((m) => ({ default: m.ProcessingHistoryPage })))
const RedeemPage = lazy(() => import('@/pages/Credits/RedeemPage').then((m) => ({ default: m.RedeemPage })))
const SettingsPage = lazy(() => import('@/pages/Dashboard/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const FeedbackPage = lazy(() => import('@/pages/Dashboard/FeedbackPage').then((m) => ({ default: m.FeedbackPage })))

const AdminDashboardPage = lazy(() => import('@/pages/Admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminUsersPage = lazy(() => import('@/pages/Admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminUserDetailPage = lazy(() => import('@/pages/Admin/AdminUserDetailPage').then((m) => ({ default: m.AdminUserDetailPage })))
const AdminCardsPage = lazy(() => import('@/pages/Admin/AdminCardsPage').then((m) => ({ default: m.AdminCardsPage })))
const AdminOperationsPage = lazy(() => import('@/pages/Admin/AdminOperationsPage').then((m) => ({ default: m.AdminOperationsPage })))
const AdminFeedbackPage = lazy(() => import('@/pages/Admin/AdminFeedbackPage').then((m) => ({ default: m.AdminFeedbackPage })))
const AdminToolsPage = lazy(() => import('@/pages/Admin/AdminToolsPage').then((m) => ({ default: m.AdminToolsPage })))
const AdminSystemPage = lazy(() => import('@/pages/Admin/AdminSystemPage').then((m) => ({ default: m.AdminSystemPage })))
const AdminStoragePage = lazy(() => import('@/pages/Admin/AdminStoragePage').then((m) => ({ default: m.AdminStoragePage })))
const AdminTransfersPage = lazy(() => import('@/pages/Admin/AdminTransfersPage').then((m) => ({ default: m.AdminTransfersPage })))
const AdminFilesPage = lazy(() => import('@/pages/Admin/AdminFilesPage').then((m) => ({ default: m.AdminFilesPage })))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'id-photo', element: <IdPhotoPage /> },
      { path: 'face-reading', element: <Navigate to="/facemap" replace /> },
      { path: 'facemap', element: <FaceMapPage /> },
      { path: 'face-similarity', element: <FaceSimilarityPage /> },
      { path: 'r/:token', element: <ResultSharePage /> },
      { path: 'legal/privacy', element: <PrivacyPolicyPage /> },
      { path: 'legal/terms', element: <TermsPage /> },
      { path: 'share/:token', element: <ShareClaimPage /> },
      { path: 'transfer', element: <TransferCreatePage /> },
      { path: 't/:token', element: <TransferReceivePage /> },
      {
        path: 'image-tools',
        children: [
          { index: true, element: <ImageToolsIndexPage /> },
          { path: 'compress', element: <CompressPage /> },
          { path: 'heic-to-jpg', element: <HeicToJpgPage /> },
          { path: 'convert', element: <ConvertPage /> },
          { path: 'mosaic', element: <MosaicPage /> },
          { path: 'scan-enhance', element: <ScanEnhancePage /> },
          { path: 'remove-bg', element: <RemoveBgPage /> },
          { path: 'upscale', element: <UpscalePage /> },
          { path: 'restore-face', element: <RestoreFacePage /> },
          { path: 'denoise', element: <DenoisePage /> },
          { path: 'colorize', element: <ColorizePage /> },
          { path: 'inpaint', element: <InpaintPage /> },
          { path: 'ocr', element: <OcrPage /> },
          { path: 'segment', element: <SegmentPage /> },
          ...FORMAT_PAIRS.map((pair) => ({
            path: pair.slug,
            element: <FormatConvertPage {...pair} />,
          })),
        ],
      },
      {
        path: 'pdf-tools',
        children: [
          { index: true, element: <PdfToolsPage /> },
          { path: 'compress', element: <PdfToolsPage /> },
          { path: 'merge', element: <PdfToolsPage /> },
          { path: 'pages', element: <PdfToolsPage /> },
          { path: 'from-images', element: <PdfToolsPage /> },
          { path: 'split', element: <PdfToolsPage /> },
        ],
      },
      {
        path: 'text-tools',
        children: [
          { index: true, element: <TextToolsIndexPage /> },
          { path: 'word-counter', element: <WordCounterPage /> },
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
          { path: 'feedback', element: <FeedbackPage /> },
          { path: 'hub', element: <HubFilesPage /> },
          { path: 'transfers', element: <TransferListPage /> },
        ],
      },
    ],
  },
  // Console (admin) — independent top-level route, no RootLayout wrapper
  {
    path: 'console',
    element: (
      <AdminRoute>
        <ConsoleLayout />
      </AdminRoute>
    ),
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'users/:id', element: <AdminUserDetailPage /> },
      { path: 'cards', element: <AdminCardsPage /> },
      { path: 'tools', element: <AdminToolsPage /> },
      { path: 'operations', element: <AdminOperationsPage /> },
      { path: 'feedback', element: <AdminFeedbackPage /> },
      { path: 'system', element: <AdminSystemPage /> },
      { path: 'storage', element: <AdminStoragePage /> },
      { path: 'transfers', element: <AdminTransfersPage /> },
      { path: 'files', element: <AdminFilesPage /> },
    ],
  },
  // Redirect old /admin paths to /console
  { path: 'admin/*', element: <Navigate to="/console" replace /> },
  { path: '*', element: <NotFoundPage /> },
])
