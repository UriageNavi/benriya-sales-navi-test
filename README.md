# 便利屋 売上ナビ（Cloudflare Workers版）

Netlify Functionsを使わず、Cloudflare Workers + Static AssetsでフロントエンドとAI APIを同一Workerにまとめた構成です。
OpenAI APIキーはGitHubに置かず、Cloudflare WorkerのSecret `OPENAI_API_KEY` に登録してください。

## GitHub → Cloudflare
1. このリポジトリに `index.html` / `worker.js` / `wrangler.jsonc` / `.assetsignore` を置く。
2. Cloudflare Dashboard → Workers & Pages → Create application → Import a repository からGitHubリポジトリを接続。
3. Worker名は `benriya-sales-navi-test` にする。
4. RuntimeのVariables & Secretsで `OPENAI_API_KEY` をSecretとして登録。
5. `main` ブランチへpushすると自動デプロイ。

OpenAIモデルは `gpt-5.6-luna` を既定値にしています。必要ならCloudflare側の `OPENAI_MODEL` で変更できます。
