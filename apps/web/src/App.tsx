import { Routes, Route } from 'react-router-dom'
import AssetBuilderPage from './routes/AssetBuilderPage.js'
import AssetDetailPage from './routes/AssetDetailPage.js'
import MyPacksPage from './routes/MyPacksPage.js'
import PackDetailPage from './routes/PackDetailPage.js'
import HistoryPage from './routes/HistoryPage.js'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AssetBuilderPage />} />
      <Route path="/assets/new" element={<AssetBuilderPage />} />
      <Route path="/assets/:assetId" element={<AssetDetailPage />} />
      <Route path="/packs" element={<MyPacksPage />} />
      <Route path="/packs/new" element={<MyPacksPage />} />
      <Route path="/packs/:packId" element={<PackDetailPage />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  )
}

export default App
