Run a database query using Prisma. The argument is the query to run.

Use `node -e` with the PrismaClient from `server/node_modules/.prisma/client/index.js`:

```js
const { PrismaClient } = require("../server/node_modules/.prisma/client/index.js");
const prisma = new PrismaClient();
```

Execute the query described in the argument and display results as a formatted table. Always disconnect at the end.

Example usage: /db show all teams in league 1 with their budgets
Example usage: /db count active roster entries per team in league 2
Example usage: /db find players with isKeeper=true in league 1
