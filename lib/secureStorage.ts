import CryptoJS from 'crypto-js'

/**
 * Generate or retrieve session-specific encryption key
 * Key is stored in sessionStorage and destroyed when browser tab closes
 */
function getSessionKey(): string {
  if (typeof window === 'undefined') return ''

  let key = sessionStorage.getItem('_exam_encryption_key')
  if (!key) {
    // Generate random 256-bit key
    key = CryptoJS.lib.WordArray.random(32).toString()
    sessionStorage.setItem('_exam_encryption_key', key)
  }
  return key
}

/**
 * Encrypt exam state data
 * @param state - Exam state object to encrypt
 * @returns Encrypted string or null on error
 */
export function encryptExamState(state: any): string | null {
  try {
    const key = getSessionKey()
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(state),
      key
    ).toString()
    return encrypted
  } catch (error) {
    // console.error('Encryption failed:', error)
    return null
  }
}

/**
 * Decrypt exam state data
 * @param encrypted - Encrypted string
 * @returns Decrypted state object or null on error
 */
export function decryptExamState(encrypted: string): any | null {
  try {
    const key = getSessionKey()
    const decrypted = CryptoJS.AES.decrypt(encrypted, key)
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8)

    // Check if plaintext is empty (invalid key/data)
    if (!plaintext) {
      // console.warn('Decryption returned empty - clearing invalid data')
      return null
    }

    return JSON.parse(plaintext)
  } catch (error) {
    // Silently handle decryption errors (old/invalid data)
    // console.warn('Decryption failed - clearing corrupted data')
    return null
  }
}
