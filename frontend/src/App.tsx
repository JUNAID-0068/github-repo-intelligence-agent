import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import InputPage from './pages/InputPage'
import LoadingPage from './pages/LoadingPage'
import ResultsPage from './pages/ResultsPage'

function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-purple-600/5 blur-[120px]" />
      </div>
      <div className="relative z-10 text-center space-y-6 max-w-md">
        <h1 className="text-6xl font-black bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">404</h1>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Page not found</h2>
          <p className="text-gray-400 text-sm">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 font-semibold text-sm transition-all shadow-lg shadow-purple-500/20"
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<InputPage />} />
        <Route path="/loading/:report_id" element={<LoadingPage />} />
        <Route path="/results/:report_id" element={<ResultsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
