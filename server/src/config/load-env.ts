import dotenv from 'dotenv'

// dotenv >= 17 logs an "injecting env" line by default; keep server output clean.
dotenv.config({ quiet: true })
