Run a smoke test against the local API server on port 4010.

Hit each endpoint and report the HTTP status code. Use curl with `-s -o /dev/null -w "%{http_code}"`.

**Public endpoints (expect 200):**
- GET http://localhost:4010/api/health
- GET http://localhost:4010/api/auth/health

**Auth-required endpoints (expect 401 if no token):**
- GET http://localhost:4010/api/leagues
- GET http://localhost:4010/api/teams
- GET http://localhost:4010/api/trades
- GET http://localhost:4010/api/transactions
- GET http://localhost:4010/api/waivers
- GET http://localhost:4010/api/auction/state
- GET http://localhost:4010/api/auction-values
- GET http://localhost:4010/api/players
- GET http://localhost:4010/api/periods
- GET http://localhost:4010/api/archive/seasons

First check if the server is running on port 4010. If not, tell the user to start it with `npm run server`.

Report results as a table: Endpoint | Expected | Actual | Status (PASS/FAIL).
