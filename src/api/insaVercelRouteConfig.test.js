import fs from 'node:fs';
import path from 'node:path';

test('maps deployed INSA splat requests to the Vercel function', () => {
  const config = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  );

  expect(config.rewrites).toContainEqual({
    source: '/api/insa/:path*',
    destination: '/api/insa/[...path]',
  });
});
