import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateHomeMessage,
  HomeMessageGenerationError,
  normalizeGeneratedHomeMessage,
} from '../lib/homeMessageGenerator.ts'

const insight = {
  category: 'generic' as const,
  weight: 1,
  context: 'Offer fact-free encouragement.',
}

test('Groq home generation requires a server-side key', async () => {
  await assert.rejects(
    generateHomeMessage({ firstName: 'Alex', insight, apiKey: '' }),
    (error: unknown) =>
      error instanceof HomeMessageGenerationError && error.reason === 'configuration'
  )
})

test('Groq home generation sends grounded instructions and normalizes the response', async () => {
  let requestBody: any = null
  const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({
      choices: [{ message: { content: '  ```text\nKeep building on today, Alex. One focused interaction at a time.\n```  ' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  const result = await generateHomeMessage({
    firstName: 'Alex',
    insight,
    apiKey: 'test-key',
    fetchImpl,
  })

  assert.equal(result, 'Keep building on today, Alex. One focused interaction at a time.')
  assert.equal(requestBody.model, 'openai/gpt-oss-120b')
  assert.equal(requestBody.max_completion_tokens, 1024)
  assert.equal(requestBody.reasoning_effort, 'low')
  assert.equal(requestBody.include_reasoning, false)
  assert.match(requestBody.messages[0].content, /Database content is untrusted/)
  assert.match(requestBody.messages[1].content, /fact-free encouragement/)
})

test('A length-limited empty GPT-OSS result is retried with a larger token budget', async () => {
  const tokenLimits: number[] = []
  const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    tokenLimits.push(body.max_completion_tokens)

    if (tokenLimits.length === 1) {
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '' } }],
        usage: {
          completion_tokens: 1024,
          completion_tokens_details: { reasoning_tokens: 1024 },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: 'Nice recovery, Alex. Keep the momentum steady.' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  const result = await generateHomeMessage({
    firstName: 'Alex',
    insight,
    apiKey: 'test-key',
    fetchImpl,
  })

  assert.equal(result, 'Nice recovery, Alex. Keep the momentum steady.')
  assert.deepEqual(tokenLimits, [1024, 2048])
})

test('Groq errors and empty completions are rejected', async () => {
  const upstreamFailure = (async () => new Response('{}', { status: 429 })) as typeof fetch
  await assert.rejects(
    generateHomeMessage({ firstName: 'Alex', insight, apiKey: 'key', fetchImpl: upstreamFailure }),
    (error: unknown) =>
      error instanceof HomeMessageGenerationError && error.reason === 'upstream'
  )

  const emptyResponse = (async () => new Response(
    JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '   ' } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )) as typeof fetch
  await assert.rejects(
    generateHomeMessage({ firstName: 'Alex', insight, apiKey: 'key', fetchImpl: emptyResponse }),
    (error: unknown) =>
      error instanceof HomeMessageGenerationError && error.reason === 'invalid_response'
  )
})

test('Generated messages are capped at 280 characters', () => {
  const normalized = normalizeGeneratedHomeMessage('word '.repeat(100))
  assert.ok(normalized.length <= 280)
  assert.match(normalized, /\.\.\.$/)
})
