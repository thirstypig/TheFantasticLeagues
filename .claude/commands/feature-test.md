Run tests for a specific feature module. The argument is the feature name.

Run both server and client tests for the specified feature:

1. Server: `cd server && npx vitest run src/features/$ARGUMENTS/__tests__/ --reporter=verbose`
2. Client: `cd client && npx vitest run src/features/$ARGUMENTS/__tests__/ --reporter=verbose`

If either directory doesn't have tests, note that. Report results concisely.
