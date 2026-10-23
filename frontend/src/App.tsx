import { Route, Routes } from 'react-router'
import { GuestOnly, RequireAuth } from './auth/RouteGuards'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PostDetailPage } from './pages/PostDetailPage'
import { SignupPage } from './pages/SignupPage'
import { TimelinePage } from './pages/TimelinePage'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route index element={<TimelinePage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
