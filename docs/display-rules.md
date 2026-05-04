# Display Rules

## Fantasy Team Names

Fantasy team codes are backend identifiers only. They may be used in routes,
imports, joins, API payloads, audits, and admin/debug tooling, but they must
not be used as user-facing labels in the frontend.

User-facing league views must show the full fantasy team name. This includes
Home, Standings, Teams, Team pages, Activity, Commissioner views, reports,
digests, and any roster or transaction confirmation UI.

MLB team abbreviations are allowed in player tables because they identify the
real MLB club for a player, not the fantasy team.

## Planning Labels

Use `todo` for the micro/actionable task list and `roadmap` for the macro
product direction. Do not introduce a separate user-facing `todo-task` label.
The two planning levels must stay connected through the shared planning data.

## OGBA Position Labels

OGBA roster slots use league slot labels, not raw MLB defensive-role labels.

- Pitchers display as `P`; do not split OGBA roster slots into `SP` and `RP`.
- Outfielders display as `OF`; do not split OGBA roster slots into `LF`, `CF`,
  and `RF`.
- Corner-man displays as `CM`, not `CI`.
- Middle infield displays as `MI`.
- Designated hitter displays as `DH`.

MLB team abbreviations remain valid in player tables.
