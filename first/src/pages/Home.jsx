import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

// IMPORTANT: getUniqIdValue — extracts the unique identifier (DB primary key) from any user object.
// Note: All user identity comparisons must go through this function for consistency.
// Nota bene: This corresponds to the unique index on the `id` column in the database.
const getUniqIdValue = (user) => user?.id ?? null

// Note: Avatar color palette — deterministic color based on username hash.
const avatarColors = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-orange-500', 'bg-cyan-500'
]

// Note: getAvatarColor — maps a username to a consistent avatar background color.
const getAvatarColor = (name = '') => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

// Note: getInitials — returns 1-2 letter initials from a username for avatar display.
const getInitials = (name = '') => {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Note: formatDate — formats a date string into a human-readable short format.
const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// IMPORTANT: Pagination constant — number of user rows shown per page.
const ROWS_PER_PAGE = 10

const Home = () => {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [page, setPage] = useState(1)
  // Note: toasts — array of { id, message, type } for temporary status notifications.
  const [toasts, setToasts] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Welcome!', message: 'Thank you for registering. Your account is active.', time: 'Just now', read: false, type: 'success' },
    { id: 2, title: 'Security Tip', message: 'Always log out when using a shared device.', time: '5m ago', read: false, type: 'info' },
  ])
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}') || {}

  useEffect(() => {
    // IMPORTANT: Redirect unauthenticated users to login page immediately.
    if (!localStorage.getItem('user')) { navigate('/login'); return }

    // IMPORTANT: Global axios request interceptor — attaches the current user's ID
    // as a custom header (X-User-Id) on every outgoing request.
    // Note: This enables the server-side requireAuth middleware to validate the requester
    // without requiring changes to every individual API call.
    // Nota bene: The interceptor is cleaned up when the component unmounts.
    const interceptorId = axios.interceptors.request.use((config) => {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      if (user?.id) {
        config.headers['X-User-Id'] = String(getUniqIdValue(user))
      }
      return config
    })

    fetchUsers()

    // Cleanup: eject the interceptor when the Home component unmounts
    return () => axios.interceptors.request.eject(interceptorId)
  }, [])

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.notification-container')) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])

  // Note: addNotification — appends a new event notification to the real-time notification list.
  const addNotification = (title, message, type = 'info') => {
    const newNotif = {
      id: Date.now(),
      title,
      message,
      time: 'Just now',
      read: false,
      type
    }
    setNotifications(prev => [newNotif, ...prev])
  }

  // IMPORTANT: API_BASE — switches between local development and production backend URL.
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://task4-ots0.onrender.com'

  // Note: showToast — displays a temporary notification message for 3 seconds.
  // Types: 'success' (green), 'error' (red), 'info' (blue).
  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  // IMPORTANT: checkCurrentUser — implements the 5th requirement from the task spec.
  // Before each protected action, the server is asked to verify the user still exists
  // and is not blocked. If the check fails (403), the user is logged out immediately.
  // Nota bene: This is called at the START of every toolbar action handler.
  const checkCurrentUser = async () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    if (!getUniqIdValue(user)) {
      localStorage.removeItem('user')
      navigate('/login')
      return false
    }
    try {
      await axios.get(`${API_BASE}/auth/check?id=${getUniqIdValue(user)}`)
      return true
    } catch (err) {
      // Note: 403 means the user is blocked or deleted — redirect to login.
      if (err.response?.status === 403) {
        localStorage.removeItem('user')
        navigate('/login')
        return false
      }
      // Nota bene: Network errors don't block the user — fail open.
      return true
    }
  }

  // Note: fetchUsers — loads all users from the server sorted by last login (server-side).
  // Nota bene: 403 on this call means the current user became blocked between actions — skip
  //            silently here; the NEXT toolbar action's checkCurrentUser() will redirect to login.
  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/users`)
      setUsers(res.data)
    } catch (err) {
      console.log(err)
      if (err.response?.status !== 403) {
        showToast('Failed to load users. Please refresh.', 'error')
      }
      // Note: 403 is intentionally swallowed here — the next toolbar action will
      // call checkCurrentUser() which will properly redirect blocked/deleted users.
    }
  }

  const totalPages = Math.ceil(users.length / ROWS_PER_PAGE)
  const paginatedUsers = users.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const allSelected = paginatedUsers.length > 0 && paginatedUsers.every(u => selectedIds.includes(getUniqIdValue(u)))
  const someSelected = paginatedUsers.some(u => selectedIds.includes(getUniqIdValue(u))) && !allSelected

  // IMPORTANT: toolbarDisabled — toolbar buttons are disabled when no users are selected.
  // Note: Toolbar always stays visible (never hidden) per task requirement.
  const toolbarDisabled = selectedIds.length === 0

  // Note: handleSelectAll — selects or deselects all users on the current page.
  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(prev => [...new Set([...prev, ...paginatedUsers.map(u => getUniqIdValue(u))])])
    else setSelectedIds(prev => prev.filter(id => !paginatedUsers.map(u => getUniqIdValue(u)).includes(id)))
  }

  // Note: handleSelectOne — toggles selection state for a single user row.
  const handleSelectOne = (id) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  // IMPORTANT: handleBlock — blocks all selected users.
  // Note: checkCurrentUser is called first (5th requirement).
  // Nota bene: Self-block shows "Blocked" in UI and sets a global listener to logout on next click.
  const handleBlock = async () => {
    if (!selectedIds.length) return
    const isActive = await checkCurrentUser()
    if (!isActive) return

    const idsToBlock = [...selectedIds]
    const isSelfBlockedAction = idsToBlock.includes(getUniqIdValue(currentUser))

    // Optimistic update — instantly show Blocked in UI (including self)
    setUsers(prev => prev.map(u => idsToBlock.includes(getUniqIdValue(u)) ? { ...u, status: 'Blocked' } : u))
    setSelectedIds([])
    try {
      await axios.put(`${API_BASE}/auth/block`, { ids: idsToBlock })
      showToast(`${idsToBlock.length} user(s) blocked successfully`, 'success')
      addNotification('Users Blocked', `Blocked ${idsToBlock.length} user(s) successfully`, 'warning')
      
      if (!isSelfBlockedAction) {
        fetchUsers()
      }
      // Nota bene: If self-blocked, we intentionally do NOT call fetchUsers().
      // The UI already shows "Blocked" (optimistic update above).
      // The next toolbar action will call checkCurrentUser() which will detect
      // the blocked status from the DB and redirect to login.
    } catch (e) {
      showToast('Failed to block users. Please try again.', 'error')
      if (!isSelfBlockedAction) {
        fetchUsers() // rollback on error — but skip if self-block to avoid 403 logout
      }
    }
  }

  // Note: handleUnblock — restores selected users to their pre-block status.
  // Nota bene: Unverified users go back to 'Unverified', verified users go back to 'Active'.
  const handleUnblock = async () => {
    if (!selectedIds.length) return
    const isActive = await checkCurrentUser()
    if (!isActive) return

    const idsToUnblock = [...selectedIds]
    // Optimistic update — use is_verified flag to decide restored status
    setUsers(prev => prev.map(u => idsToUnblock.includes(getUniqIdValue(u)) ? { ...u, status: u.is_verified ? 'Active' : 'Unverified' } : u))
    setSelectedIds([])
    try {
      await axios.put(`${API_BASE}/auth/unblock`, { ids: idsToUnblock })
      showToast(`${idsToUnblock.length} user(s) unblocked successfully`, 'success')
      addNotification('Users Unblocked', `Unblocked ${idsToUnblock.length} user(s) successfully`, 'success')
      fetchUsers()
    } catch (e) {
      showToast('Failed to unblock users. Please try again.', 'error')
      fetchUsers() // rollback on error
    }
  }

  // IMPORTANT: handleDelete — permanently removes selected users from the database.
  // Note: Deleted users are truly deleted (not soft-deleted or marked).
  // Nota bene: If the current user deletes themselves, they are logged out immediately.
  const handleDelete = async () => {
    if (!selectedIds.length) return
    const isActive = await checkCurrentUser()
    if (!isActive) return

    const idsToDelete = [...selectedIds]
    const isSelfSelected = idsToDelete.includes(getUniqIdValue(currentUser))
    if (isSelfSelected) {
      // Self-delete: delete from DB then logout immediately
      try { await axios.delete(`${API_BASE}/auth/delete`, { data: { ids: idsToDelete } }) } catch (e) {}
      handleLogout()
      return
    }
    // Optimistic update — remove from UI instantly
    setUsers(prev => prev.filter(u => !idsToDelete.includes(getUniqIdValue(u))))
    setSelectedIds([])
    try {
      await axios.delete(`${API_BASE}/auth/delete`, { data: { ids: idsToDelete } })
      showToast(`${idsToDelete.length} user(s) deleted successfully`, 'success')
      addNotification('Users Deleted', `Permanently deleted ${idsToDelete.length} user(s)`, 'error')
      fetchUsers()
    } catch (e) {
      showToast('Failed to delete users. Please try again.', 'error')
      fetchUsers() // rollback on error
    }
  }

  // Note: handleDeleteUnverified — deletes only unverified users from the current selection.
  // IMPORTANT: Only users with status === 'Unverified' are affected, even if more are selected.
  const handleDeleteUnverified = async () => {
    // Filter selection to only include unverified users
    const selectedUnverifiedIds = users
      .filter(u => selectedIds.includes(getUniqIdValue(u)) && u.status === 'Unverified')
      .map(u => getUniqIdValue(u))

    if (selectedUnverifiedIds.length === 0) {
      showToast('No unverified users in current selection', 'info')
      return
    }
    const isActive = await checkCurrentUser()
    if (!isActive) return

    const isSelfSelected = selectedUnverifiedIds.includes(getUniqIdValue(currentUser))
    if (isSelfSelected) {
      try {
        await axios.delete(`${API_BASE}/auth/delete`, { data: { ids: selectedUnverifiedIds } })
      } catch (e) {}
      handleLogout()
      return
    }

    // Optimistic update — remove selected unverified users from UI instantly
    setUsers(prev => prev.filter(u => !selectedUnverifiedIds.includes(getUniqIdValue(u))))
    setSelectedIds(prev => prev.filter(id => !selectedUnverifiedIds.includes(id)))
    try {
      await axios.delete(`${API_BASE}/auth/delete`, { data: { ids: selectedUnverifiedIds } })
      showToast(`${selectedUnverifiedIds.length} unverified user(s) deleted`, 'success')
      addNotification('Unverified Users Deleted', `Deleted ${selectedUnverifiedIds.length} unverified user(s)`, 'error')
      fetchUsers()
    } catch (e) {
      showToast('Failed to delete unverified users. Please try again.', 'error')
      fetchUsers() // rollback on error
    }
  }

  // Note: handleLogout — clears local session and redirects to login page.
  const handleLogout = () => { localStorage.removeItem('user'); navigate('/login') }

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans">

      {/* ── Toast Notifications ──
          Note: Fixed-position toast container — shows operation status messages.
          Nota bene: No animations per task requirement — plain display only. */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2.5 rounded-md shadow-md text-sm font-medium text-white ${
              toast.type === 'success' ? 'bg-green-600' :
              toast.type === 'error'   ? 'bg-red-600'   : 'bg-blue-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* ── Navbar ── */}
      <nav className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-base font-bold text-gray-900 tracking-tight">Users</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative notification-container">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              title="Notifications"
              className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
              </svg>
              {notifications.some(n => !n.read) && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white"></span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-md border border-gray-200 shadow-xl py-1 z-30 text-left">
                <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <span className="font-semibold text-gray-800 text-xs uppercase tracking-wider">Notifications</span>
                  {notifications.some(n => !n.read) && (
                    <button
                      onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-gray-400">No notifications</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif))}
                        className={`px-4 py-2.5 hover:bg-gray-50 cursor-pointer flex gap-2.5 items-start transition-colors ${!n.read ? 'bg-blue-50/20' : ''}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                          n.type === 'success' ? 'bg-green-500' :
                          n.type === 'warning' ? 'bg-amber-500' :
                          n.type === 'error'   ? 'bg-red-500'   : 'bg-blue-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs text-gray-800 ${!n.read ? 'font-semibold text-gray-900' : ''}`}>{n.title}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 break-words leading-relaxed">{n.message}</p>
                          <span className="text-[10px] text-gray-400 block mt-1">{n.time}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="px-4 py-1.5 border-t border-gray-100 text-center bg-gray-50/50">
                    <button
                      onClick={() => setNotifications([])}
                      className="text-[10px] text-red-500 hover:text-red-700 font-medium cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div
            title={`Logged in as ${currentUser.username || 'Admin'}`}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${getAvatarColor(currentUser.username || 'A')}`}
          >
            {getInitials(currentUser.username || 'Admin')}
          </div>
          <button
            id="btn-logout"
            onClick={handleLogout}
            title="Logout from this session"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-sm transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.08a.75.75 0 1 0-1.004-1.116l-2.5 2.25a.75.75 0 0 0 0 1.116l2.5 2.25a.75.75 0 1 0 1.004-1.116l-1.048-1.08H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
            </svg>
            Logout
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">

          {/* ── Toolbar ──
              IMPORTANT: Toolbar is ALWAYS visible — it never appears or disappears.
              Note: Buttons switch between enabled/disabled based on selection state.
              Nota bene: toolbarDisabled = true when selectedIds is empty. */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">

            {/* Block — text button with lock icon */}
            <button
              id="btn-block"
              onClick={handleBlock}
              disabled={toolbarDisabled}
              title={toolbarDisabled ? 'Select at least one user to block' : 'Block selected users'}
              className={`flex items-center gap-1.5 px-4 py-2 text-white text-xs font-semibold rounded-md transition-colors ${
                toolbarDisabled
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-[#2563eb] hover:bg-[#1d4ed8] cursor-pointer'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
              Block
            </button>

            {/* Unblock — icon-only button with unlock icon */}
            <button
              id="btn-unblock"
              onClick={handleUnblock}
              disabled={toolbarDisabled}
              title={toolbarDisabled ? 'Select at least one user to unblock' : 'Unblock selected users'}
              className={`w-9 h-9 flex items-center justify-center border rounded-md transition-colors ${
                toolbarDisabled
                  ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-500 cursor-pointer'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0 0 10 5.5V9H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5V5.5a3 3 0 1 1 6 0v2.75a.75.75 0 0 0 1.5 0V5.5A4.5 4.5 0 0 0 14.5 1Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Delete — icon-only button with trash icon */}
            <button
              id="btn-delete"
              onClick={handleDelete}
              disabled={toolbarDisabled}
              title={toolbarDisabled ? 'Select at least one user to delete' : 'Permanently delete selected users'}
              className={`w-9 h-9 flex items-center justify-center border rounded-md transition-colors ${
                toolbarDisabled
                  ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'bg-white border-red-300 hover:bg-red-50 text-red-500 cursor-pointer'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Delete Unverified — amber icon-only button */}
            <button
              id="btn-delete-unverified"
              onClick={handleDeleteUnverified}
              disabled={toolbarDisabled}
              title={toolbarDisabled ? 'Select at least one user to delete unverified' : 'Delete selected unverified users only'}
              className={`w-9 h-9 flex items-center justify-center border rounded-md transition-colors ${
                toolbarDisabled
                  ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'bg-white border-amber-400 hover:bg-amber-50 text-amber-500 cursor-pointer'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Note: Selection counter — shows how many users are currently selected */}
            {selectedIds.length > 0 && (
              <span className="ml-2 text-xs text-gray-400 select-none">
                {selectedIds.length} selected
              </span>
            )}
          </div>

          {/* ── Table ──
              IMPORTANT: Data is sorted server-side by last_login DESC.
              Note: Leftmost column is checkboxes only — no labels. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 w-12">
                    {/* IMPORTANT: Select-All checkbox — header checkbox with indeterminate state support */}
                    <input
                      id="select-all-checkbox"
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={handleSelectAll}
                      title="Select or deselect all users on this page"
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  {/* Note: Sorted by this column descending on the server */}
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">No users found.</td>
                  </tr>
                ) : paginatedUsers.map(user => {
                  // Note: Use getUniqIdValue for all identity checks — consistent with DB unique key
                  const isSelected = selectedIds.includes(getUniqIdValue(user))
                  return (
                    <tr
                      key={getUniqIdValue(user)}
                      onClick={() => handleSelectOne(getUniqIdValue(user))}
                      className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(getUniqIdValue(user))}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${getAvatarColor(user.username)}`}>
                            {getInitials(user.username)}
                          </div>
                          <span className="font-medium text-gray-900">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{user.email}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(user.last_login)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          user.status === 'Active'  ? 'bg-green-100 text-green-700'  :
                          user.status === 'Blocked' ? 'bg-red-100 text-red-600'      :
                                                      'bg-yellow-100 text-yellow-700'
                        }`}>
                          {user.status || 'Active'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing {users.length === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1} to {Math.min(page * ROWS_PER_PAGE, users.length)} of {users.length} users
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
              </button>
              {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium cursor-pointer transition-colors ${
                    page === p ? 'bg-blue-600 text-white border border-blue-600' : 'border border-gray-200 hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages || 1, p + 1))}
                disabled={page === (totalPages || 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Home