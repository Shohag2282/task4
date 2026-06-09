import express from 'express'
import { connectToDatabase } from '../lib/db.js'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const router = express.Router()

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
        
        const htmlContent = `
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
        
        // Send verification email using Brevo HTTP API (Works locally and on Render without SMTP block)
        try {
            console.log('Sending email via Brevo HTTP API to:', email)
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'api-key': process.env.BREVO_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: 'Auth App', email: 'shamimhossen2282@gmail.com' },
                    to: [{ email: email }],
                    subject: 'Verify Your Email Address',
                    htmlContent: htmlContent
                })
            })
            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.message || JSON.stringify(data))
            }
            console.log('Verification email sent successfully via Brevo API!', data)
        } catch (mailErr) {
            console.error('Failed to send verification email via Brevo:', mailErr)
            throw new Error(`Email sending failed: ${mailErr.message}`)
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
    
    const frontendUrl = 'https://task4-frontend.onrender.com'

    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT * FROM users WHERE verification_token = ?', [token])
        if (rows.length === 0) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Invalid Token</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8f9fa; }
                    .box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
                    h2 { color: #dc3545; } p { color: #666; }
                    a { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
                    a:hover { background: #0052a3; }
                </style></head>
                <body><div class="box">
                    <h2>❌ Invalid or Expired Link</h2>
                    <p>This verification link has already been used or has expired. If you already verified, you can log in directly.</p>
                    <p style="font-size:13px;color:#888;">You can now close this tab and go to the app to log in.</p>
                    <a href="${frontendUrl}">Open App</a>
                </div></body></html>
            `)
        }
        
        await db.query(
            "UPDATE users SET status = 'Active', verification_token = NULL WHERE id = ?",
            [rows[0].id]
        )
        
        return res.status(200).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verified</title>
            <style>
                body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8f9fa; }
                .box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
                h2 { color: #28a745; } p { color: #666; }
                a { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
                a:hover { background: #0052a3; }
            </style></head>
            <body><div class="box">
                <h2>✅ Email Verified Successfully!</h2>
                <p>Your account has been activated. You can now log in to access the dashboard.</p>
                <a href="${frontendUrl}">Go to App & Login</a>
            </div></body></html>
        `)
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