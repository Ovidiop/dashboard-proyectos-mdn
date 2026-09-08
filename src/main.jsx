import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AppLayout from './components/AppLayout.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import RequireModule from './components/RequireModule.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import HomePage from './pages/HomePage.jsx'
import TicketsPage from './pages/TicketsPage.jsx'
import AdsPage from './pages/AdsPage.jsx'
import TareasPage from './pages/TareasPage.jsx'
import TareasFijasPage from './pages/TareasFijasPage.jsx'
import CnpPage from './pages/CnpPage.jsx'
import PautasPage from './pages/PautasPage.jsx'
import ChequeoPage from './pages/ChequeoPage.jsx'
import EmpresaPage from './pages/EmpresaPage.jsx'
import EvaluacionesPage from './pages/EvaluacionesPage.jsx'
import MetricasPage from './pages/MetricasPage.jsx'
import MonitorUsoPage from './pages/MonitorUsoPage.jsx'
import ReunionesPage from './pages/ReunionesPage.jsx'
import LeadsPage from './pages/LeadsPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* Inicio */}
            <Route index element={<HomePage />} />

            {/* Soporte Técnico */}
            <Route
              path="/tickets"
              element={
                <RequireModule moduleKey="tickets">
                  <TicketsPage />
                </RequireModule>
              }
            />
            <Route
              path="/tickets/analytics"
              element={
                <RequireModule moduleKey="tickets">
                  <TicketsPage />
                </RequireModule>
              }
            />
            <Route
              path="/tickets/notificaciones"
              element={
                <RequireModule moduleKey="tickets">
                  <TicketsPage />
                </RequireModule>
              }
            />

            {/* Campañas */}
            <Route
              path="/ads"
              element={
                <RequireModule moduleKey="ads">
                  <AdsPage />
                </RequireModule>
              }
            />

            {/* Gestión de Tareas */}
            <Route
              path="/tareas"
              element={
                <RequireModule moduleKey="tareas">
                  <TareasPage />
                </RequireModule>
              }
            />
            <Route
              path="/tareas/fijas"
              element={
                <RequireModule moduleKey="tareas">
                  <TareasFijasPage />
                </RequireModule>
              }
            />
            <Route
              path="/tareas/pautas"
              element={
                <RequireModule moduleKey="tareas">
                  <PautasPage />
                </RequireModule>
              }
            />
            <Route
              path="/tareas/chequeo"
              element={
                <RequireModule moduleKey="tareas">
                  <ChequeoPage />
                </RequireModule>
              }
            />

            {/* CNP — Contenido No Planificado */}
            <Route
              path="/cnp"
              element={
                <RequireModule moduleKey="cnp">
                  <CnpPage />
                </RequireModule>
              }
            />

            {/* Empresa */}
            <Route
              path="/empresa"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />
            <Route
              path="/empresa/departamentos"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />
            <Route
              path="/empresa/empleados"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />
            <Route
              path="/empresa/preguntas"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />
            <Route
              path="/empresa/clientes"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />
            <Route
              path="/empresa/lineas"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />
            <Route
              path="/empresa/desempeno-perfiles"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />
            <Route
              path="/empresa/permisos"
              element={
                <RequireModule moduleKey="empresa">
                  <EmpresaPage />
                </RequireModule>
              }
            />

            {/* Evaluaciones — flujo manual retirado en F6 (ver ARQUITECTURA.md §2.7):
                /evaluaciones/resumen y /evaluaciones/perfil-v2 → /evaluaciones;
                /evaluaciones/perfil y /evaluaciones/desempeno (viejo alias) → mi-desempeno /
                /evaluaciones respectivamente. */}
            <Route
              path="/evaluaciones"
              element={
                <RequireModule moduleKey="evaluaciones">
                  <EvaluacionesPage />
                </RequireModule>
              }
            />
            <Route
              path="/evaluaciones/mi-desempeno"
              element={
                <RequireModule moduleKey="evaluaciones">
                  <EvaluacionesPage />
                </RequireModule>
              }
            />
            <Route
              path="/evaluaciones/historial"
              element={
                <RequireModule moduleKey="evaluaciones">
                  <EvaluacionesPage />
                </RequireModule>
              }
            />
            <Route
              path="/evaluaciones/empleado/:id"
              element={
                <RequireModule moduleKey="evaluaciones">
                  <EvaluacionesPage />
                </RequireModule>
              }
            />
            <Route path="/evaluaciones/resumen" element={<Navigate to="/evaluaciones" replace />} />
            <Route
              path="/evaluaciones/perfil-v2"
              element={<Navigate to="/evaluaciones" replace />}
            />
            <Route
              path="/evaluaciones/desempeno"
              element={<Navigate to="/evaluaciones" replace />}
            />
            <Route
              path="/evaluaciones/perfil"
              element={<Navigate to="/evaluaciones/mi-desempeno" replace />}
            />

            {/* Reportes */}
            <Route
              path="/reportes"
              element={
                <RequireModule moduleKey="reportes">
                  <MetricasPage />
                </RequireModule>
              }
            />
            <Route
              path="/reportes/linea/:lineId"
              element={
                <RequireModule moduleKey="reportes">
                  <MetricasPage />
                </RequireModule>
              }
            />
            {/* Monitor de uso */}
            <Route
              path="/monitor-uso"
              element={
                <RequireModule moduleKey="monitor_uso">
                  <MonitorUsoPage />
                </RequireModule>
              }
            />
            <Route
              path="/monitor-uso/graficas"
              element={
                <RequireModule moduleKey="monitor_uso">
                  <MonitorUsoPage />
                </RequireModule>
              }
            />

            {/* Reuniones */}
            <Route
              path="/reuniones"
              element={
                <RequireModule moduleKey="reuniones">
                  <ReunionesPage />
                </RequireModule>
              }
            />

            {/* Leads */}
            <Route
              path="/leads"
              element={
                <RequireModule moduleKey="leads">
                  <LeadsPage />
                </RequireModule>
              }
            />

            {/* Proyectos */}
            <Route path="/proyectos" element={<App />} />

            {/* Rutas desconocidas → Inicio */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
