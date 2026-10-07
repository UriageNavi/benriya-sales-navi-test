# 便利屋 売上ナビ — Cloudflare API Worker

このリポジトリのWorkerはAI API専用です。現在のNetlifyフロント画面は残し、AI処理だけCloudflare Workersへ移します。

## GitHub
`worker.js` と `wrangler.jsonc` をリポジトリのルートに置いてCloudflare Workers Buildsからデプロイします。

## Secret
Cloudflare WorkerのRuntime Variables & Secretsに `OPENAI_API_KEY` をSecretとして登録してください。GitHubにはAPIキーを置きません。

## Endpoints
- `GET /api/health`
- `POST /api/questions`
- `POST /api/analyze`

CORS対応済みです。デプロイ後に発行されたWorker URLを現在のNetlifyフロントのAPI送信先に設定します。
