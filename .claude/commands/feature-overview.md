Show an overview of a feature module. The argument is the feature name (e.g., "auction", "keeper-prep", "teams").

For the specified feature, show:

1. **Server files**: List all files in `server/src/features/$ARGUMENTS/`
2. **Client files**: List all files in `client/src/features/$ARGUMENTS/`
3. **Routes**: Show the router export and all route definitions (HTTP method + path)
4. **Cross-feature imports**: Show any imports from other feature modules
5. **Test coverage**: List test files and count of tests
6. **API client**: Show exported functions from the client api.ts

Keep the output structured and concise.
