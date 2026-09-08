import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { loadLines, loadClients } from '../components/metricas/metricsApi'
import { visibleLinesForUser } from '../utils/lineMembers'
import AudiovisualView from '../components/pautas/AudiovisualView'

export default function PautasPage() {
  const { userProfile, can = () => true } = useAuth()

  const [lines, setLines] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    setLoading(true)
    const companyId = userProfile.company_id

    const [linesRes, clientsRes] = await Promise.all([
      loadLines(companyId, { includeGeneral: false }),
      loadClients(companyId),
    ])

    // extraViewAll: `visibleLinesForUser` solo conoce access_level/admin/tasks_view_all —
    // sin esto, alguien con la capability `audiovisual.ver_todo` (p. ej. Lizdania, nivel 2
    // y sin membresía en ninguna línea) recibía un `lines` vacío y no podía ver la info
    // por línea ni en el calendario ni en el mensaje de WhatsApp, aunque AudiovisualView ya
    // calculaba `canViewAll=true` para ella con la prop que sí le llegaba.
    setLines(
      visibleLinesForUser(linesRes.data ?? [], userProfile, {
        // audiovisual.piezas también levanta el filtro por línea: un editor de
        // Audiovisual gestiona piezas de cualquier cliente, no solo el de su línea.
        extraViewAll: can('audiovisual.ver_todo') || can('audiovisual.piezas'),
      }),
    )
    setClients(clientsRes.data ?? [])
    setLoading(false)
  }, [userProfile, can])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <main className="flex-1 overflow-y-auto main-bg">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-1 text-[12px] font-mono uppercase tracking-wide text-[#a29b8c]">
          Gestión de Tareas <span className="text-[#ccc]">›</span> Pautas
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Pautas</h1>
            <p className="text-[15px] text-[#888] mt-0.5">Calendario de pautas audiovisuales</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <AudiovisualView
            companyId={userProfile?.company_id}
            userProfile={userProfile}
            can={can}
            lines={lines}
            clients={clients}
          />
        )}
      </div>
    </main>
  )
}
