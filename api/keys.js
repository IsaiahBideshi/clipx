import { ok } from "assert";
import dotenv from "dotenv";
import path from "path";




export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'GET') {
    const keys = {
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
    }
    if (!keys.googleClientId || !keys.googleClientSecret) {
      return res.status(500).json({ data: null, error: 'Missing Google API keys in environment variables', ok: false })
    }
    return res.status(200).json({ data: keys, error: null, ok: true })
  }
}