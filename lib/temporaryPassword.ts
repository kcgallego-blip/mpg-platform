import { randomInt } from 'crypto'

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const NUMBERS = '23456789'
const SYMBOLS = '!@#$%&*+-=?'
const ALL_CHARACTERS = `${LOWERCASE}${UPPERCASE}${NUMBERS}${SYMBOLS}`

function randomCharacter(characters: string) {
  return characters[randomInt(characters.length)]
}

export function generateTemporaryPassword(length = 16) {
  if (!Number.isInteger(length) || length < 4) {
    throw new Error('Temporary password length must be at least 4')
  }

  const characters = [
    randomCharacter(LOWERCASE),
    randomCharacter(UPPERCASE),
    randomCharacter(NUMBERS),
    randomCharacter(SYMBOLS),
  ]

  while (characters.length < length) {
    characters.push(randomCharacter(ALL_CHARACTERS))
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]
  }

  return characters.join('')
}

