# Environment Variable Reference

This document serves as the canonical reference for all environment variables used in the TipTune project.

## 🚀 Backend (NestJS)

Variables used by the backend service. Most are defined in `backend/src/config/env.validation.ts`.

### Core Application
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | No | `development` |
| `PORT` | Port the server listens on | No | `3001` |
| `API_PREFIX` | Base path for API routes | No | `api` |
| `API_VERSION` | Current API version | No | `v1` |
| `APP_VERSION` | Application version (e.g., from `package.json`) | No | `0.0.1` |
| `FRONTEND_URL` | URL of the frontend application (CORS/WebSockets) | No | `http://localhost:3000` |

### Database (PostgreSQL)
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `DB_HOST` | Database host address | **Yes** | `localhost` |
| `DB_PORT` | Database port | **Yes** | `5432` |
| `DB_USERNAME` | Database user | **Yes** | `postgres` |
| `DB_PASSWORD` | Database password | **Yes** | `password` |
| `DB_NAME` | Database name | **Yes** | `tiptune` |

### Authentication & Security
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `JWT_SECRET` | Secret key for signing JWT tokens | **Yes** (Prod) | `your-super-secret-jwt-key` |
| `JWT_EXPIRES_IN` | Token expiration duration | No | `7d` |
| `EMBED_SECRET` | Secret for signing embed player tokens | No | `embed-secret-key` |

### Storage
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `STORAGE_TYPE` | Storage backend (`local`, `s3`) | No | `local` |
| `UPLOAD_DIR` | Local directory for uploaded files | No | `uploads` |
| `MAX_FILE_SIZE` | Max file size in bytes | No | `52428800` (50MB) |
| `ALLOWED_MIME_TYPES` | Comma-separated allowed audio types | No | `audio/mpeg,audio/wav,audio/flac,audio/ogg` |

### Stellar Blockchain
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `STELLAR_NETWORK` | Network (`testnet`, `mainnet`, `futurenet`) | No | `testnet` |
| `STELLAR_HORIZON_URL` | Custom Horizon API URL | No | (Testnet default) |
| `STELLAR_FRIENDBOT_URL` | Custom Friendbot URL | No | (Testnet default) |
| `STELLAR_NETWORK_PASSPHRASE` | Custom network passphrase | No | (Testnet default) |
| `STELLAR_TIP_ESCROW_CONTRACT` | Deployed Tip Escrow contract ID | **Yes** | - |

### Redis & Rate Limiting
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `REDIS_HOST` | Redis server host | No | `localhost` |
| `REDIS_PORT` | Redis server port | No | `6379` |
| `REDIS_PASSWORD` | Redis server password | No | - |
| `REDIS_DB` | Redis database number | No | `0` |
| `REDIS_URL` | Full Redis connection URL (alternative to above) | No | - |
| `RATE_LIMIT_WHITELIST` | Comma-separated IPs to skip throttling | No | `127.0.0.1,::1` |
| `RATE_LIMIT_PUBLIC` | Requests per minute for public endpoints | No | `60` |
| `RATE_LIMIT_AUTHENTICATED` | Requests per minute for auth users | No | `300` |
| `RATE_LIMIT_AUTH_ENDPOINTS` | Requests per minute for login/register | No | `10` |
| `RATE_LIMIT_TIP_SUBMISSION` | Requests per minute for tip operations | No | `30` |
| `RATE_LIMIT_SEARCH` | Requests per minute for search | No | `100` |
| `RATE_LIMIT_FILE_UPLOAD` | Requests per minute for uploads | No | `5` |

### External Services (Optional)
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `AWS_ACCESS_KEY_ID` | AWS Access Key | No | - |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Key | No | - |
| `AWS_REGION` | AWS Region | No | - |
| `AWS_S3_BUCKET` | AWS S3 Bucket Name | No | - |
| `ELASTICSEARCH_URL` | Elasticsearch endpoint | No | `http://localhost:9200` |
| `ELASTICSEARCH_USERNAME` | Elasticsearch user | No | - |
| `ELASTICSEARCH_PASSWORD` | Elasticsearch password | No | - |
| `PAGERDUTY_ROUTING_KEY` | PagerDuty integration key | No | - |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | No | `info` |

### Feature Flags
| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `ENABLE_NFT_MINTING` | Enable automated NFT minting features | No | `false` |
| `SMART_PLAYLIST_REFRESH_ENABLED` | Enable background playlist updates | No | `true` |
| `SMART_PLAYLIST_REFRESH_INTERVAL_MS` | Playlist refresh interval | No | `900000` (15m) |

---

## 💻 Frontend (Vite)

Variables used by the React application. Must be prefixed with `VITE_` to be exposed.

| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `VITE_API_BASE_URL` | Backend API base URL | **Yes** | `http://localhost:3001/api/v1` |
| `VITE_STELLAR_NETWORK` | Stellar network (`testnet`, `mainnet`) | **Yes** | `testnet` |
| `VITE_STELLAR_HORIZON_URL` | Custom Horizon API URL | No | (Testnet default) |
| `VITE_PUBLIC_VAPID_KEY` | Public VAPID key for Push Notifications | No | - |
| `VITE_YJS_WS_URL` | WebSocket URL for collaboration features | No | `wss://demos.yjs.dev` |

### Development Only
| Variable | Description | Use Case |
| :--- | :--- | :--- |
| `VITE_DEV_USER_ID` | Override current user ID | Bypassing wallet auth for testing |
| `VITE_DEV_ARTIST_ID` | Override current artist ID | Bypassing wallet auth for testing |

---

## 📜 Smart Contracts (Soroban)

Variables used during contract deployment and testing.

| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `NETWORK` | Network target for deployment scripts | No | `testnet` |

---

## 🧪 Testing

Variables specifically for automated tests.

| Variable | Description |
| :--- | :--- |
| `TEST_DB_HOST` | Test database host (defaults to `DB_HOST`) |
| `TEST_DB_PORT` | Test database port |
| `TEST_DB_USERNAME` | Test database user |
| `TEST_DB_PASSWORD` | Test database password |
| `TEST_DB_NAME` | Test database name (defaults to `tiptune_test`) |
| `VERBOSE_TESTS` | Set to `true` for detailed unit test output |
| `VERBOSE_E2E` | Set to `true` for detailed E2E test output |
