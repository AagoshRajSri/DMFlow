# DMFlow Frontend

Quick React + Vite + Tailwind dashboard for DMFlow demo.

Run locally:

```bash
cd frontend
npm install
npm run dev
```

App will run on http://localhost:5173 by default.

Notes:
- Backend base URL is hard-coded to `https://dmflow-wgoy.onrender.com` in `src/App.jsx`.
- Webhook testing requires server-side signatures; the frontend shows a note instead of sending unsigned webhooks.
- No secrets or API keys are stored in the frontend.
