import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'

import { AdminRoute } from '@/components/auth/AdminRoute'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AdminLayout } from '@/layouts/AdminLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { RootLayout } from '@/layouts/RootLayout'
import { NotFoundPage } from '@/pages/NotFoundPage'

const HomePage = lazy(() => import('@/pages/Home/HomePage').then((m) => ({ default: m.HomePage })))
const IdPhotoPage = lazy(() => import('@/pages/IdPhoto/IdPhotoPage').then((m) => ({ default: m.IdPhotoPage })))
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

const PdfToolsPage = lazy(() => import('@/pages/PdfTools/PdfToolsPage').then((m) => ({ default: m.PdfToolsPage })))

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

const AdminDashboardPage = lazy(() => import('@/pages/Admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminUsersPage = lazy(() => import('@/pages/Admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminUserDetailPage = lazy(() => import('@/pages/Admin/AdminUserDetailPage').then((m) => ({ default: m.AdminUserDetailPage })))
const AdminCardsPage = lazy(() => import('@/pages/Admin/AdminCardsPage').then((m) => ({ default: m.AdminCardsPage })))
const AdminOperationsPage = lazy(() => import('@/pages/Admin/AdminOperationsPage').then((m) => ({ default: m.AdminOperationsPage })))

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
          { path: 'remove-bg', element: <RemoveBgPage /> },
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
      {
        path: 'admin',
        element: (
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        ),
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'users/:id', element: <AdminUserDetailPage /> },
          { path: 'cards', element: <AdminCardsPage /> },
          { path: 'operations', element: <AdminOperationsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
