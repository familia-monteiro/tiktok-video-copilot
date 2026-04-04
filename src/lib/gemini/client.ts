import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY!

export const genAI = new GoogleGenerativeAI(apiKey)

export const geminiPro = genAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
})

export const geminiFlash = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
})

export const embeddingModel = genAI.getGenerativeModel({
  model: 'text-embedding-004',
})
