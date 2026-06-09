import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRouter from './routes/authRoutes.js'
import { connectToDatabase } from './lib/db.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use('/auth', authRouter)

// Auto-create table and unique index script
const initDb = async () => {
    try {
        const db = await connectToDatabase()
        
        const createTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            password VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'Unverified',
            last_login VARCHAR(100) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            verification_token VARCHAR(255) DEFAULT NULL
        );`
        
        await db.query(createTableQuery)
        console.log("✅ ক্লাউড ডেটাবেজে 'users' টেবিল সফলভাবে তৈরি বা ভেরিফাই হয়েছে!")
        
        // unique index check for email
        try {
            const createIndexQuery = `ALTER TABLE users ADD UNIQUE INDEX (email);`
            await db.query(createIndexQuery)
            console.log("🔥 মেন্টরের শর্ত অনুযায়ী ইমেইল UNIQUE INDEX সফলভাবে সেট হয়েছে!")
        } catch (idxErr) {
            console.log("💡 ইউনিক ইনডেক্স হয়তো আগেই তৈরি করা আছে।")
        }
    } catch (err) {
        console.error("❌ ক্লাউডে টেবিল তৈরিতে সমস্যা হয়েছে:", err)
    }
}

app.listen(process.env.PORT, async () => {
    console.log("Server is running")
    await initDb()
})