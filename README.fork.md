# Worker compatibility fork

Based on LogVar 1.21.4, upstream commit `afc8b8119f981492a5caee52f1e1ebf756bd0d41`.

Changes:
- Preserve provider aliases in episode search responses.
- Forward season and episode coordinates, including specials season zero.
- Prefer Windows search results containing foreign-language aliases for the Renren source, retaining TV/Mac/Web fallbacks.
- Add `AUTH_ENABLED=false` for a private service behind a trusted gateway. This trusts all incoming requests, including administration. The default remains `true`.

## Build

```sh
npm ci --ignore-scripts
npm run test:worker
npm run build:worker
```

The lockfile pins dependencies. The Worker template disables public routes, `workers.dev`, and preview URLs. Deployments supply their own account, service name, variables, and service bindings outside this repository. Do not enable `AUTH_ENABLED=false` on a publicly reachable deployment. The calling gateway must authorize requests and restrict administration before forwarding.

When authentication is disabled, no `TOKEN` or `ADMIN_TOKEN` is needed. A management UI served below a gateway path keeps that path for subsequent requests.

License: AGPL-3.0. Keep the license and provide users the corresponding source for the exact deployed commit, including the lockfile and build instructions. Deploy-specific credentials and private gateway code do not belong in this repository.
