import { expect, test } from './fixtures'

// Through the compose stack this goes via nginx, which must neither answer
// with its own HTML page nor name its version.
for (const megabytes of [1.1, 3]) {
  test(`a ${megabytes} MB body gets the JSON 413, with no server version`, async ({
    request,
  }) => {
    const padding = 'x'.repeat(Math.round(megabytes * 1024 * 1024))
    const response = await request.post('/api/v1/calculate', {
      headers: { 'Content-Type': 'application/json' },
      data: `{"operation":"add","operands":[1,2],"padding":"${padding}"}`,
    })
    expect(response.status()).toBe(413)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(await response.json()).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: expect.stringContaining('1048576'),
      },
    })
    expect(response.headers()['server'] ?? '').not.toMatch(/[0-9]/)
  })
}
