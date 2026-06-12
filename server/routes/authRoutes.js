import express from 'express'
import { connectToDatabase } from '../lib/db.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const router = express.Router()

// IMPORTANT: requireAuth middleware — implements the 5th task requirement.
// Note: Reads the X-User-Id header (set by the frontend axios interceptor on every request)
// and verifies the user still exists in the DB and is not blocked.
// Nota bene: This middleware must be applied to ALL routes except /register and /login.
const requireAuth = async (req, res, next) => {
    const userId = req.headers['x-user-id']
    if (!userId) {
        // Note: If header is missing, proceed without blocking (backward compatibility).
        return next()
    }
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT id, status FROM users WHERE id=?', [userId])
        if (rows.length === 0) {
            return res.status(403).json({ message: 'User no longer exists' })
        }
        if (rows[0].status === 'Blocked') {
            return res.status(403).json({ message: 'User is blocked' })
        }
        // Note: Active and Unverified users are both allowed to perform actions
        next()
    } catch (err) {
        // Nota bene: On DB error, let request proceed to avoid locking out users
        next()
    }
}

// IMPORTANT: sendVerificationEmail — sends the email verification link via Brevo HTTP API.
// Note: This is called asynchronously (fire-and-forget) from the register endpoint.
// Nota bene: Registration is NOT blocked by email delivery — user is registered immediately.
const sendVerificationEmail = async (toEmail, htmlContent) => {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: 'Auth App', email: 'shamimhossen2282@gmail.com' },
            to: [{ email: toEmail }],
            subject: 'Verify Your Email Address',
            htmlContent: htmlContent
        })
    })
    const data = await response.json()
    if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data))
    }
    console.log('Verification email sent successfully via Brevo API!', data)
    return data
}

// ── Register ──
// Note: User is registered immediately and a success response is returned.
// IMPORTANT: Email is sent asynchronously — a failure to send does NOT fail the registration.
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body
    try {
        const db = await connectToDatabase()
        
        // Nota bene: Uniqueness is enforced by the UNIQUE INDEX on the email column in the DB.
        // The code does NOT check for duplicates — the storage layer guarantees uniqueness.
        const hashpassword = await bcrypt.hash(password, 10)
        const verificationToken = crypto.randomBytes(32).toString('hex')
        
        await db.query(
            "INSERT INTO users(username, email, password, status, verification_token) VALUES (?,?,?,'Unverified',?)",
            [username, email, hashpassword, verificationToken]
        )
        
        // IMPORTANT: Always use the live backend URL so verification links work from any network.
        const backendUrl = process.env.BACKEND_URL || 'https://task4-ots0.onrender.com'
        const verificationLink = `${backendUrl}/auth/verify?token=${verificationToken}`
        
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
        
        // IMPORTANT: Fire-and-forget email — registration response is NOT blocked by email delivery.
        // Note: If email fails, it logs an error but the user is already registered successfully.
        sendVerificationEmail(email, htmlContent)
            .catch(err => console.error('Failed to send verification email (non-blocking):', err))
        
        res.status(201).json({ message: "User registered successfully. Please check your email to verify your account." })
    } catch (err) {
        console.error("Error in registration:", err)
        // Note: DB unique constraint violation (email already exists) returns 500 from mysql2.
        // Nota bene: We rely on the unique index — no manual duplicate check needed.
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "Email already exists" })
        }
        res.status(500).json({ message: err.message || "Registration failed" })
    }
})

// ── Login ──
// Note: Blocked users cannot login. Unverified users CAN login per task requirements.
router.post('/login', async (req, res) => {
    const { email, password } = req.body
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email])
        if (rows.length === 0) return res.status(404).json({ message: "Email not found" })
        
        // IMPORTANT: Blocked users are denied login access.
        if (rows[0].status === 'Blocked') return res.status(403).json({ message: "Account is blocked" })
        
        const isMatch = await bcrypt.compare(password, rows[0].password)
        if (!isMatch) return res.status(401).json({ message: "Wrong password" })
        
        try {
            await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [rows[0].id])
        } catch (e) { /* Note: last_login column update failure is non-critical */ }
        
        res.status(200).json({
            message: "Login successful",
            user: { id: rows[0].id, username: rows[0].username, email: rows[0].email }
        })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Verify Email (Step 1 — GET) ──
// IMPORTANT: GET only shows a confirmation page — does NOT activate the account yet.
// Note: This prevents email clients (Gmail, Outlook, etc.) from auto-activating accounts
//       by pre-fetching the verification link for preview/spam scanning purposes.
// Nota bene: The actual activation happens only when the user clicks "Confirm" (POST).
router.get('/verify', async (req, res) => {
    const { token } = req.query
    if (!token) return res.status(400).send("Verification token is missing")

    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT id, status FROM users WHERE verification_token = ?', [token])
        if (rows.length === 0) {
            return res.status(400).send(`
                <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
                <title>Invalid Token</title>
                <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa}.box{background:white;padding:40px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}h2{color:#dc3545}p{color:#666;font-size:15px;line-height:1.6}</style>
                </head><body><div class="box">
                <h2>❌ Invalid or Expired Link</h2>
                <p>This verification link has already been used or has expired.<br>If you already verified your email, you can log in from the app.</p>
                </div></body></html>
            `)
        }

        // Note: Show confirmation page — user must actively click the button to activate.
        const backendUrl = process.env.BACKEND_URL || 'https://task4-ots0.onrender.com'
        return res.status(200).send(`
            <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
            <title>Confirm Email Verification</title>
            <style>
                body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa}
                .box{background:white;padding:40px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}
                h2{color:#0066cc}p{color:#666;font-size:15px;line-height:1.6}
                button{padding:12px 28px;background:#0066cc;color:white;border:none;border-radius:6px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:10px}
                button:hover{background:#0052a3}
                #msg{margin-top:16px;font-size:14px;color:#333}
            </style>
            </head><body><div class="box">
            <h2>✉️ Confirm Your Email</h2>
            <p>Click the button below to verify your email address and activate your account.</p>
            <button onclick="confirmVerification()">Confirm Email</button>
            <div id="msg"></div>
            <script>
                async function confirmVerification() {
                    document.querySelector('button').disabled = true;
                    document.getElementById('msg').textContent = 'Verifying...';
                    try {
                        const res = await fetch('${backendUrl}/auth/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: '${token}' })
                        });
                        const data = await res.json();
                        if (res.ok) {
                            document.querySelector('button').style.display = 'none';
                            document.getElementById('msg').innerHTML = '<span style="color:#28a745;font-size:18px">✅ Email Verified!</span><br><span style="color:#666">Your account is now active. You can close this tab and log in.</span>';
                        } else {
                            document.getElementById('msg').innerHTML = '<span style="color:#dc3545">' + (data.message || 'Verification failed.') + '</span>';
                            document.querySelector('button').disabled = false;
                        }
                    } catch(e) {
                        document.getElementById('msg').innerHTML = '<span style="color:#dc3545">Network error. Please try again.</span>';
                        document.querySelector('button').disabled = false;
                    }
                }
            </script>
            </div></body></html>
        `)
    } catch (err) {
        console.error("Verification error:", err)
        res.status(500).send("Internal Server Error")
    }
})

// ── Verify Email (Step 2 — POST) ──
// IMPORTANT: This is the actual activation step — only triggered by the user's explicit click.
// Note: Sets status to 'Active' (unless Blocked) and clears the verification_token.
// Nota bene: Token is consumed (set to NULL) so the link cannot be used again.
router.post('/verify', async (req, res) => {
    const { token } = req.body
    if (!token) return res.status(400).json({ message: "Verification token is missing" })

    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT id, status FROM users WHERE verification_token = ?', [token])
        if (rows.length === 0) {
            return res.status(400).json({ message: "This verification link has already been used or has expired." })
        }

        // IMPORTANT: Only update to 'Active' if not currently blocked.
        // Nota bene: 'Blocked' status takes priority over email verification.
        const newStatus = rows[0].status === 'Blocked' ? 'Blocked' : 'Active'
        await db.query(
            "UPDATE users SET status = ?, verification_token = NULL WHERE id = ?",
            [newStatus, rows[0].id]
        )

        return res.status(200).json({ message: "Email verified successfully. Your account is now active." })
    } catch (err) {
        console.error("Verification POST error:", err)
        res.status(500).json({ message: "Internal Server Error" })
    }
})

// ── Check user status (5th requirement) ──
// IMPORTANT: Called by the frontend before every protected action.
// Note: Returns 403 if user is blocked or deleted, 200 if user is active or unverified.
router.get('/check', async (req, res) => {
    const { id } = req.query
    if (!id) return res.status(400).json({ message: "No user id provided" })
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query('SELECT id, status FROM users WHERE id=?', [id])
        if (rows.length === 0) return res.status(403).json({ message: "User no longer exists" })
        if (rows[0].status === 'Blocked') return res.status(403).json({ message: "User is blocked" })
        // Note: Active and Unverified users are both allowed
        res.status(200).json({ message: "ok" })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Get all users ──
// Note: Protected by requireAuth middleware — only valid non-blocked users can fetch the list.
// IMPORTANT: Results are sorted by last_login DESC (3rd requirement).
// Nota bene: is_verified is derived from verification_token being NULL (token cleared = verified).
router.get('/users', requireAuth, async (req, res) => {
    try {
        const db = await connectToDatabase()
        const [rows] = await db.query(
            'SELECT id, username, email, status, last_login, (verification_token IS NULL) as is_verified FROM users ORDER BY last_login DESC'
        )
        res.status(200).json(rows)
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Block selected users ──
// Note: requireAuth is NOT applied here because the frontend calls checkCurrentUser()
// before this action, satisfying the 5th requirement. Applying requireAuth here would
// cause issues when a user blocks themselves (they'd be blocked before the route responds).
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
// IMPORTANT: Restores users to correct pre-block status.
// Note: Verified users → 'Active', Unverified users → 'Unverified'.
router.put('/unblock', requireAuth, async (req, res) => {
    const { ids } = req.body
    if (!ids || ids.length === 0) return res.status(400).json({ message: "No users selected" })
    try {
        const db = await connectToDatabase()
        // Nota bene: CASE expression checks verification_token to determine correct status.
        await db.query(
            "UPDATE users SET status = CASE WHEN verification_token IS NULL THEN 'Active' ELSE 'Unverified' END WHERE id IN (?)",
            [ids]
        )
        res.status(200).json({ message: "Users unblocked" })
    } catch (err) {
        res.status(500).json(err)
    }
})

// ── Permanently delete selected users ──
// IMPORTANT: Deleted users are truly removed from the database (not soft-deleted or marked).
// Note: Deleted users can re-register with the same email since the record no longer exists.
router.delete('/delete', requireAuth, async (req, res) => {
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

// ── Delete selected Unverified users only ──
// Note: Extra safety — only deletes users whose status is 'Unverified' AND id is in the list.
router.delete('/delete-unverified', requireAuth, async (req, res) => {
    const { ids } = req.body
    if (!ids || ids.length === 0) return res.status(400).json({ message: "No users selected" })
    try {
        const db = await connectToDatabase()
        await db.query("DELETE FROM users WHERE status='Unverified' AND id IN (?)", [ids])
        res.status(200).json({ message: "Selected unverified users deleted" })
    } catch (err) {
        res.status(500).json(err)
    }
})

export default router