import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

const Login = () => {
    const navigate = useNavigate()
    const [values, setValues] = useState({
        email: "",
        password: ""
    })
    const [message, setMessage] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search)
        if (queryParams.get('verified') === 'true') {
            setMessage("Email verified successfully! You can now log in.")
        } else if (queryParams.get('error') === 'invalid_token') {
            setError("Invalid or expired email verification link.")
        }
    }, [])

    const handleChange = (e) => {
        setValues({ ...values, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError("")
        setMessage("")
        setLoading(true)
        const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3000'
            : 'https://task4-ots0.onrender.com'

        try {
            const response = await axios.post(`${API_BASE}/auth/login`, values)
            localStorage.setItem('user', JSON.stringify(response.data.user))
            navigate('/')
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.message || "Login failed. Please check your credentials.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">

            <div className="w-full max-w-md bg-white p-8 rounded-sm shadow-md border border-gray-200/60">

                <h2 className="text-2xl font-bold text-gray-900 mb-6 text-left">Login</h2>

                {/* Alert Messages */}
                {message && (
                    <div className="mb-5 p-3.5 bg-green-50 border border-green-200 rounded-sm text-sm text-green-800 leading-relaxed">
                        <span className="font-semibold block mb-0.5">Success!</span>
                        {message}
                    </div>
                )}

                {error && (
                    <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-sm text-sm text-red-800 leading-relaxed">
                        <span className="font-semibold block mb-0.5">Error!</span>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">

                    {/* Email Input Field */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="email" className="text-gray-600 text-sm font-medium">
                            Email
                        </label>
                        <input
                            type="email"
                            id="email"
                            placeholder="Enter Email"
                            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:border-blue-600 text-gray-800 placeholder-gray-400"
                            name="email" onChange={handleChange} required />
                    </div>

                    {/* Password Input Field */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <label htmlFor="password" className="text-gray-600 text-sm font-medium">
                                Password
                            </label>
                            <span className="text-xs text-gray-400 cursor-default">Forgot Password?</span>
                        </div>
                        <input
                            type="password"
                            id="password"
                            placeholder="Enter Password"
                            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:border-blue-600 text-gray-800 placeholder-gray-400"
                            name="password" onChange={handleChange} required />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full mt-2 bg-[#0066cc] hover:bg-[#0052a3] text-white py-2.5 rounded-sm font-medium text-sm transition-colors duration-200 cursor-pointer ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? "Logging in..." : "Login"}
                    </button>

                </form>

                {/* Bottom text and navigation link to Register page */}
                <div className="mt-4 text-center">
                    <p className="text-sm text-gray-700">
                        Don't have an account?
                        <Link to="/register" className="text-[#0066cc] hover:underline ml-1 font-medium">
                            Sign Up
                        </Link>
                    </p>
                </div>

            </div>
        </div>
    )
}

export default Login