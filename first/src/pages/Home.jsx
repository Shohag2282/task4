import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

// Generate avatar color from name
const avatarColors = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-orange-500', 'bg-cyan-500'
]
const getAvatarColor = (name = '') => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}
const getInitials = (name = '') => {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ROWS_PER_PAGE = 10

const Home = () => {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [page, setPage] = useState(1)
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}') || {}

  useEffect(() => {
    if (!localStorage.getItem('user')) { navigate('/login'); return }
    fetchUsers()
    // ⚠️ 5th Requirement: Poll every 30s to check if current user is still active
    const interval = setInterval(() => checkCurrentUser(), 30000)
    return () => clearInterval(interval)
  }, [])

  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:300'
    : 'https://task4-ots0.onrender.com'

  // Check if current logged-in user is still active in DB
  const checkCurrentUser = async () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    if (!user?.id) return
    try {
      await axios.get(`${API_BASE}/auth/check?id=${user.id}`)
    } catch (err) {
      if (err.response?.status === 403) {
        localStorage.removeItem('user')
        navigate('/login')
      }
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/users`)
      setUsers(res.data)
    } catch (err) { console.log(err) }
  }

  const totalPages = Math.ceil(users.length / ROWS_PER_PAGE)
  const paginatedUsers = users.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const allSelected = paginatedUsers.length > 0 && paginatedUsers.every(u => selectedIds.includes(u.id))
  const someSelected = paginatedUsers.some(u => selectedIds.includes(u.id)) && !allSelected

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(prev => [...new Set([...prev, ...paginatedUsers.map(u => u.id)])])
    else setSelectedIds(prev => prev.filter(id => !paginatedUsers.map(u => u.id).includes(id)))
  }

  const handleSelectOne = (id) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const handleBlock = async () => {
    if (!selectedIds.length) return
    const isSelfSelected = selectedIds.includes(currentUser.id)
    if (isSelfSelected) {
      // If blocking self, log out immediately
      try { await axios.put(`${API_BASE}/auth/block`, { ids: selectedIds }) } catch (e) {}
      handleLogout()
      return
    }
    // Optimistic update — instantly show Blocked in UI
    setUsers(prev => prev.map(u => selectedIds.includes(u.id) ? { ...u, status: 'Blocked' } : u))
    setSelectedIds([])
    try { await axios.put(`${API_BASE}/auth/block`, { ids: selectedIds }) }
    catch (e) { fetchUsers() } // rollback on error
  }
  const handleUnblock = async () => {
    if (!selectedIds.length) return
    // Optimistic update — instantly show Active in UI
    setUsers(prev => prev.map(u => selectedIds.includes(u.id) ? { ...u, status: 'Active' } : u))
    setSelectedIds([])
    try { await axios.put(`${API_BASE}/auth/unblock`, { ids: selectedIds }) }
    catch (e) { fetchUsers() } // rollback on error
  }
  const handleDelete = async () => {
    if (!selectedIds.length) return
    const isSelfSelected = selectedIds.includes(currentUser.id)
    if (isSelfSelected) {
      // If deleting self, log out immediately
      try { await axios.delete(`${API_BASE}/auth/delete`, { data: { ids: selectedIds } }) } catch (e) {}
      handleLogout()
      return
    }
    // Optimistic update — instantly remove from UI
    setUsers(prev => prev.filter(u => !selectedIds.includes(u.id)))
    setSelectedIds([])
    try { await axios.delete(`${API_BASE}/auth/delete`, { data: { ids: selectedIds } }) }
    catch (e) { fetchUsers() } // rollback on error
  }
  const handleDeleteUnverified = async () => {
    const isSelfUnverified = currentUser.status === 'Unverified' || users.find(u => u.id === currentUser.id)?.status === 'Unverified'
    if (isSelfUnverified) {
      // If deleting unverified and self is unverified, log out immediately
      try { await axios.delete(`${API_BASE}/auth/delete-unverified`) } catch (e) {}
      handleLogout()
      return
    }
    // Optimistic update — instantly remove Unverified users from UI
    setUsers(prev => prev.filter(u => u.status !== 'Unverified'))
    setSelectedIds([])
    try { await axios.delete(`${API_BASE}/auth/delete-unverified`) }
    catch (e) { fetchUsers() } // rollback on error
  }
  const handleLogout = () => { localStorage.removeItem('user'); navigate('/login') }

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans">

      {/* ── Navbar ── */}
      <nav className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-base font-bold text-gray-900 tracking-tight">Users</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Bell */}
          <button className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-white"></span>
          </button>
          {/* Avatar — just display, no logout */}
          <div
            title={currentUser.username || 'Admin'}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${getAvatarColor(currentUser.username || 'A')}`}
          >
            {getInitials(currentUser.username || 'Admin')}
          </div>
          {/* Logout button — separate */}
          <button
            onClick={handleLogout}
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

          {/* ── Toolbar ── */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">

            {/* Block — blue with text + icon */}
            <button
              onClick={handleBlock}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-md cursor-pointer transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
              Block
            </button>

            {/* Unblock — gray border, unlock icon */}
            <button
              onClick={handleUnblock}
              title="Unblock"
              className="w-9 h-9 flex items-center justify-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-500 rounded-md cursor-pointer transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0 0 10 5.5V9H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5V5.5a3 3 0 1 1 6 0v2.75a.75.75 0 0 0 1.5 0V5.5A4.5 4.5 0 0 0 14.5 1Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Delete — red border, trash icon */}
            <button
              onClick={handleDelete}
              title="Delete selected"
              className="w-9 h-9 flex items-center justify-center bg-white border border-red-300 hover:bg-red-50 text-red-500 rounded-md cursor-pointer transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Delete Unverified — amber border, trash icon */}
            <button
              onClick={handleDeleteUnverified}
              title="Delete unverified"
              className="w-9 h-9 flex items-center justify-center bg-white border border-amber-400 hover:bg-amber-50 text-amber-500 rounded-md cursor-pointer transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* ── Table ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={handleSelectAll}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
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
                  const isSelected = selectedIds.includes(user.id)
                  return (
                    <tr
                      key={user.id}
                      onClick={() => handleSelectOne(user.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(user.id)}
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
                          user.status === 'Active' ? 'bg-green-100 text-green-700' :
                          user.status === 'Blocked' ? 'bg-red-100 text-red-600' :
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