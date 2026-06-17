import { pbkdf2, randomBytes, timingSafeEqual } from 'crypto'

const ITERATIONS = 310000
const KEY_LENGTH = 32
const DIGEST = 'sha256'

const derivePassword = (password: string, salt: Buffer, iterations: number) =>
  new Promise<Buffer>((resolve, reject) => {
    pbkdf2(password, salt, iterations, KEY_LENGTH, DIGEST, (error, derivedKey) => {
      if (error || !derivedKey) {
        reject(error)
      } else {
        resolve(derivedKey)
      }
    })
  })

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await derivePassword(password, salt, ITERATIONS)

  return [
    'pbkdf2_sha256',
    ITERATIONS,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

export async function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) return false

  const [algorithm, iterations, saltBase64, hashBase64] = storedHash.split('$')

  if (algorithm !== 'pbkdf2_sha256' || !iterations || !saltBase64 || !hashBase64) {
    return false
  }

  const salt = Buffer.from(saltBase64, 'base64')
  const expected = await derivePassword(password, salt, Number(iterations))
  const actual = Buffer.from(hashBase64, 'base64')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
