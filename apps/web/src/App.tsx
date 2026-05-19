import { Routes, Route } from 'react-router-dom'
import AssetBuilderPage from './routes/AssetBuilderPage.js'
import AssetDetailPage from './routes/AssetDetailPage.js'
import PackBuilderPage from './routes/PackBuilderPage.js'
import PackDetailPage from './routes/PackDetailPage.js'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AssetBuilderPage />} />
      <Route path="/assets/new" element={<AssetBuilderPage />} />
      <Route path="/assets/:assetId" element={<AssetDetailPage />} />
      <Route path="/packs/new" element={<PackBuilderPage />} />
      <Route path="/packs/:packId" element={<PackDetailPage />} />
    </Routes>
  )
}

export default App
