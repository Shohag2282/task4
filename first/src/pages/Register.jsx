import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

export const Register = () => {
    const navigate = useNavigate()
    const [values, setValues] = useState({
        username: "",
        email: "",
        password: ""
    })
    const [message, setMessage] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    const handleChange = (e) => {
        setValues({ ...values, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError("")
        setMessage("")
        setLoading(true)
        try {
            const response = await axios.post('https://task4-ots0.onrender.com/auth/register', values)
            setMessage(response.data.message || "Registration successful! Please check your email to verify your account.")
            setValues({ username: "", email: "", password: "" })
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.message || "Registration failed. Please try again.")
        } finally {
            setLoading(false)
        }
    }

  return (
    // Wrapper background set to professional corporate light-gray (#f8f9fa)
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      
      {/* Main form card container with shadow and border styling */}
      <div className="w-full max-w-md bg-white p-8 rounded-sm shadow-md border border-gray-200/60">
        
        {/* Header title - Updated from Register to Sign Up */}
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-left">Sign Up</h2>

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
          
          {/* Username Input Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-gray-600 text-sm font-medium">
              Username
            </label>
            <input 
              type="text" 
              id="username"
              value={values.username}
              placeholder="Enter Username" 
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:border-blue-600 text-gray-800 placeholder-gray-400"
              name="username" onChange={handleChange} required/>
          </div>

          {/* Email Input Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-gray-600 text-sm font-medium">
              Email
            </label>
            <input 
              type="email" 
              id="email"
              value={values.email}
              placeholder="Enter Email" 
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:border-blue-600 text-gray-800 placeholder-gray-400"
              name="email" onChange={handleChange} required/>
          </div>

          {/* Password Input Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-gray-600 text-sm font-medium">
              Password
            </label>
            <input 
              type="password" 
              id="password"
              value={values.password}
              placeholder="Enter Password" 
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:border-blue-600 text-gray-800 placeholder-gray-400"
              name="password" onChange={handleChange} required/>
          </div>

          {/* Submit Button with Premium Corporate Blue (#0066cc) */}
          <button 
            type="submit" 
            disabled={loading}
            className={`w-full mt-2 bg-[#0066cc] hover:bg-[#0052a3] text-white py-2.5 rounded-sm font-medium text-sm transition-colors duration-200 cursor-pointer ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? "Registering..." : "Submit"}
          </button>
          
        </form>

        {/* Bottom text and navigation link to Login page */}
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-700">
            Already have account? 
            <Link to="/login" className="text-[#0066cc] hover:underline ml-1 font-medium">
              Login
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}