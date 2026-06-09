import express from 'express'
import { connectToDatabase } from '../lib/db.js'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import nodemailer from 'nodemailer'

const router = express.Router()

// Nodemailer SMTP Transporter setup
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
})

// ── Register ──
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email])
        if (rows.length > 0) {
            return res.status(400).json({ message: "Email already exists" })
        }
        
        const hashpassword = await bcrypt.hash(password, 10)
        const verificationToken = crypto.randomBytes(32).toString('hex')
        
        await db.query(
            "INSERT INTO users(username, email, password, status, verification_token) VALUES (?,?,?,'Unverified',?)",
            [username, email, hashpassword, verificationToken]
        )
        
        // Send verification email
        const protocol = req.headers['x-forwarded-proto'] || req.protocol
        const host = req.get('host')
        const verificationLink = `${protocol}://${host}/auth/verify?token=${verificationToken}`
        
        const mailOptions = {
            from: `"Auth App" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Email Verification',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
                    <h2 style="color: #0066cc; text-align: center;">Verify Your Email Address</h2>
                    <p>Thank you for signing up! Please verify your email address to activate your account and access the dashboard.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationLink}" target="_blank" style="padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Verify Email</a>
                    </div>
                    <p style="margin-top: 15px; font-size: 12px; color: #666;">If the button above does not work, copy and paste the following link into your browser:</p>
                    <p style="font-size: 12px; color: #0066cc; word-break: break-all;">${verificationLink}</p>
                </div>
            `
        }
        
        // Wrap email sending in try-catch so registration does not hang on mail delivery issues
        try {
            await transporter.sendMail(mailOptions)
        } catch (mailErr) {
            console.error("Failed to send verification email:", mailErr)
        }
        
        res.status(201).json({ message: "User registered successfully. Please check your email to verify your account." })
    } catch (err) {
        console.error("Error in registration/email:", err)
        res.status(500).json({ message: err.message || "Registration failed" })
    }
})

// ── Login ──
router.post('/login', async (req, res) => {
    const { email, password } = req.body
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email])
        if (rows.length === 0) return res.status(404).json({ message: "Email not found" })
        if (rows[0].status === 'Blocked') return res.status(403).json({ message: "Account is blocked" })
        if (rows[0].status === 'Unverified') return res.status(403).json({ message: "Please verify your email to activate your account." })
        
        const isMatch = await bcrypt.compare(password, rows[0].password)
        if (!isMatch) return res.status(401).json({ message: "Wrong password" })
        
        try {
            await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [rows[0].id])
        } catch (e) { /* column may not exist yet */ }
        
        res.status(200).json({
            message: "Login successful",
            user: { id: rows[0].id, username: rows[0].username, email: rows[0].email }
        })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Verify Email Endpoint ──
router.get('/verify', async (req, res) => {
    const { token } = req.query
    if (!token) return res.status(400).send("Verification token is missing")
    
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT * FROM users WHERE verification_token = ?', [token])
        if (rows.length === 0) {
            return res.redirect('http://localhost:5173/login?error=invalid_token')
        }
        
        await db.query(
            "UPDATE users SET status = 'Active', verification_token = NULL WHERE id = ?",
            [rows[0].id]
        )
        
        res.redirect('http://localhost:5173/login?verified=true')
    } catch (err) {
        console.error("Verification error:", err)
        res.status(500).send("Internal Server Error")
    }
})

// ── Check if current user is still active (5th requirement) ──
router.get('/check', async (req, res) => {
    const { id } = req.query
    if (!id) return res.status(400).json({ message: "No user id provided" })
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT id, status FROM users WHERE id=?', [id])
        if (rows.length === 0) return res.status(403).json({ message: "User no longer exists" })
        if (rows[0].status === 'Blocked') return res.status(403).json({ message: "User is blocked" })
        res.status(200).json({ message: "ok" })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Get all users — sorted by last_login DESC ──
router.get('/users', async (req, res) => {
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query(
            'SELECT id, username, email, status, last_login FROM users ORDER BY last_login DESC'
        )
        res.status(200).json(rows)
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Block selected users ──
router.put('/block', async (req, res) => {
    const { ids } = req.body
    if (!ids || ids.length === 0) return res.status(400).json({ message: "No users selected" })
    try {
        const db = await connectToDatabase()
        await db.query("UPDATE users SET status='Blocked' WHERE id IN (?)", [ids])
        res.status(200).json({ message: "Users blocked" })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Unblock selected users ──
router.put('/unblock', async (req, res) => {
    const { ids } = req.body
    if (!ids || ids.length === 0) return res.status(400).json({ message: "No users selected" })
    try {
        const db = await connectToDatabase()
        await db.query("UPDATE users SET status='Active' WHERE id IN (?)", [ids])
        res.status(200).json({ message: "Users unblocked" })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Permanently delete selected users ──
router.delete('/delete', async (req, res) => {
    const { ids } = req.body
    if (!ids || ids.length === 0) return res.status(400).json({ message: "No users selected" })
    try {
        const db = await connectToDatabase()
        await db.query('DELETE FROM users WHERE id IN (?)', [ids])
        res.status(200).json({ message: "Users deleted" })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Delete only Unverified users ──
router.delete('/delete-unverified', async (req, res) => {
    try {
        const db = await connectToDatabase()
        await db.query("DELETE FROM users WHERE status='Unverified'")
        res.status(200).json({ message: "Unverified users deleted" })
    } catch (err) {
        res.status(500).json(err)
    }
})

export default router