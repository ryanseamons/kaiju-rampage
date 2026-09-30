// Stand-in for the Anthropic Messages API, used to test the "with key" path deterministically.
// The narration server is pointed here via ANTHROPIC_BASE_URL; nothing leaves the machine.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8790);
const requests = [];

http
  .createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/__requests') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(requests));
    }
    if (req.method === 'POST' && req.url?.startsWith('/v1/messages')) {
      let raw = '';
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      const prompt = body.messages?.[0]?.content ?? '';
      const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      const buildings = /Destruction: (\d+) buildings/.exec(text)?.[1] ?? '?';
      const district = /Hardest-hit district this wave: ([^.\n]+)/.exec(text)?.[1] ?? '?';
      const wave = /after wave (\d+)/i.exec(text)?.[1] ?? '?';
      requests.push({ model: body.model, keyOk: req.headers['x-api-key'] === 'sk-test-fake', system: !!body.system, wave, buildings, district });
      const bulletin = {
        headline: `MOCK DESK: ${buildings} BUILDINGS DOWN`,
        anchor: `[MOCK MODEL] After wave ${wave}, ${district} bears the scars of ${buildings} flattened buildings, and our reporter is hiding under a desk.`,
        ticker: [`[MOCK] ${district.toUpperCase()} REPORTS HEAVY DAMAGE`, '[MOCK] THIS TEXT CAME FROM THE MOCK ANTHROPIC ENDPOINT', '[MOCK] REAL KEY → REAL CLAUDE COPY', '[MOCK] STAY INDOORS'],
      };
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_mock' });
      return res.end(
        JSON.stringify({
          id: 'msg_mock', type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text: JSON.stringify(bulletin) }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 420, output_tokens: 120 },
        }),
      );
    }
    res.writeHead(404).end();
  })
  .listen(PORT, () => console.log(`[mock-anthropic] :${PORT}`));
