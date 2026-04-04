/**
 * Criptografia AES-256-GCM via @noble/ciphers.
 * Funções puras — recebem a chave como parâmetro.
 * A obtenção/geração da chave mestra fica em src/lib/crypto/master-key.ts
 * Referência: Seção 32 do Master Plan v3.0
 */

import { gcm } from '@noble/ciphers/aes.js'
import { randomBytes } from '@noble/ciphers/utils.js'

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Criptografa um valor com a chave fornecida (AES-256-GCM).
 * Retorna formato: hex(iv):hex(ciphertext+tag)
 */
export function encryptWithKey(key: Uint8Array, plaintext: string): string {
  const iv = randomBytes(12) // 96 bits — recomendado para GCM
  const cipher = gcm(key, iv)
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = cipher.encrypt(encoded)
  return `${bytesToHex(iv)}:${bytesToHex(ciphertext)}`
}

/**
 * Descriptografa um valor com a chave fornecida.
 * Espera formato: hex(iv):hex(ciphertext+tag)
 */
export function decryptWithKey(key: Uint8Array, encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 2) {
    throw new Error('Formato inválido. Esperado: hex(iv):hex(ciphertext)')
  }
  const iv = hexToBytes(parts[0])
  const ciphertext = hexToBytes(parts[1])
  const cipher = gcm(key, iv)
  const plaintext = cipher.decrypt(ciphertext)
  return new TextDecoder().decode(plaintext)
}

/**
 * Mascara um valor sensível para exibição na UI.
 */
export function maskSensitiveValue(value: string): string {
  if (!value || value.length <= 8) return '****'
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}
