# EdgeMailAPI — agent-native email

Send transactional email, newsletters, and AI-written email from one tiny API.
Built to be handed to AI agents: plain-English sending, idempotent retries,
scoped/capped keys, and machine-readable receipts.

```bash
npm install edgemailapi
```

```js
import { EdgeMail } from "edgemailapi";
const em = new EdgeMail(process.env.EDGEMAIL_API_KEY);

// Send something you wrote
await em.send({ to: "a@b.com", subject: "Welcome", text: "Glad you're here." });

// Or just describe it — AI writes + sends
await em.intent({ goal: "thank Jane for upgrading and link the docs", to: "jane@b.com" });
```

## CLI
```bash
npx edgemail init --key em_xxx
npx edgemail send --to you@example.com --subject "Hi" --text "Hello"
npx edgemail intent --to you@example.com --goal "remind them to finish setup" --dry
npx edgemail check edgemailapi.com          # deliverability report
npx edgemail migrate --subscribers list.csv --domain you.com   # one-command import
```

## GitHub Action
```yaml
- uses: YOUR_GH/edgemailapi-sdk@v1
  with:
    api_key: ${{ secrets.EDGEMAIL_API_KEY }}
    to: team@you.com
    subject: "Deploy ${{ github.sha }} succeeded"
    text: "Production is live."
```

## MCP (for AI agents)
Add to your MCP client (Claude Desktop, Cursor, etc.):
```json
{ "mcpServers": { "edgemail": { "command": "npx",
  "args": ["mcp-remote","https://mcp.edgemailapi.com/","--header","Authorization: Bearer em_YOUR_KEY"] } } }
```

MIT licensed. Docs: https://edgemailapi.com
