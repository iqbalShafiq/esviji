import { Routes, Route } from 'react-router-dom'
import AssetBuilderPage from './routes/AssetBuilderPage.js'
import AssetDetailPage from './routes/AssetDetailPage.js'
import MyPacksPage from './routes/MyPacksPage.js'
import PackDetailPage from './routes/PackDetailPage.js'
import HistoryPage from './routes/HistoryPage.js'
import LoginPage from './routes/LoginPage.js'
import RegisterPage from './routes/RegisterPage.js'
import AdminPage from './routes/AdminPage.js'
import BillingPage from './routes/BillingPage.js'
import { ProtectedRoute } from './auth/ProtectedRoute.js'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><AssetBuilderPage /></ProtectedRoute>} />
      <Route path="/assets/new" element={<ProtectedRoute><AssetBuilderPage /></ProtectedRoute>} />
      <Route path="/assets/:assetId" element={<ProtectedRoute><AssetDetailPage /></ProtectedRoute>} />
      <Route path="/packs" element={<ProtectedRoute><MyPacksPage /></ProtectedRoute>} />
      <Route path="/packs/new" element={<ProtectedRoute><MyPacksPage /></ProtectedRoute>} />
      <Route path="/packs/:packId" element={<ProtectedRoute><PackDetailPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
    </Routes>
  )
}

export default App
