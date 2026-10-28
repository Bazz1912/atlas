import { readFile, writeFile } from 'node:fs/promises'
const tokens = JSON.parse(await readFile(new URL('../src/design/tokens.json', import.meta.url), 'utf8'))
await writeFile(new URL('../src/styles/tokens.css', import.meta.url),
  '/* Generato da src/design/tokens.json: npm run theme */\n:root {\n' +
  Object.entries(tokens).map(([name, value]) => `  --${name}: ${value};`).join('\n') + '\n}\n')
