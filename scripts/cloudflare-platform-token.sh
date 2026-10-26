#!/bin/bash
# Create the single Cloudflare credential of the platform and store it in the vault.
#
# One account-owned API token, allowed on every selectable account and zone permission
# group except the ones that manage the account itself (tokens, members, settings,
# billing), stored as CLOUDFLARE_API_TOKEN in the platform project's single
# environment. Pulumi and Wrangler read it from there.
# Run once. Run again to rotate: a new token is created, verified and stored, the old
# one is deleted at the end.
#
# usage: cloudflare-platform-token.sh <account-id> [token-name]
#
# Needs: a bootstrap token with "Account API Tokens Write" and "Account Settings Read",
# created in the Cloudflare dashboard. It is pasted at a prompt that does not echo, and
# it is deleted by this script if it is a user token. No token value is ever printed,
# passed as an argument or written to a file: the vault write goes through its API, from
# a variable, and is verified by name.
set -euo pipefail

PLATFORM_PROJECT=${INFISICAL_PLATFORM_PROJECT_ID:-721a5f71-3801-40e2-a06d-a4a9b431e1c7}
ACCOUNT=${1:?usage: cloudflare-platform-token.sh <account-id> [token-name]}
NAME=${2:-nextnode-platform}
API=https://api.cloudflare.com/client/v4
VAULT=https://app.infisical.com/api/v3/secrets/raw

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s||"{}");const v=new Function("j","return ("+process.argv[1]+")")(j);console.log(v==null?"":typeof v==="string"?v:JSON.stringify(v))})' "$1"; }
cf() { curl -sS -H "Authorization: Bearer $BOOT" -H 'content-type: application/json' "$@"; }
# Cloudflare answers every request with a JSON envelope; its success field is the verdict.
ok() { [ "$(printf '%s' "$1" | json 'j.success')" = "true" ]; }
errors() { printf '%s' "$1" | json 'j.errors?.map(e=>e.message).join("; ")'; }
fail() { echo "error: $*" >&2; exit 1; }

command -v infisical >/dev/null || fail "infisical CLI not installed"
SESSION=$(infisical user get token --plain 2>/dev/null) || fail "no Infisical session, run: infisical login"
vault() { curl -sS -H "Authorization: Bearer $SESSION" -H 'content-type: application/json' "$@"; }

printf 'Bootstrap Cloudflare token (not echoed): '; read -rs BOOT; echo
[ -n "$BOOT" ] || fail "empty token"

ACCOUNTS=$(cf "$API/accounts")
ok "$ACCOUNTS" || fail "list accounts: $(errors "$ACCOUNTS")"
printf '%s' "$ACCOUNTS" | json "j.result.some(a=>a.id===\"$ACCOUNT\")" | grep -q true || fail "the bootstrap token does not see account $ACCOUNT"
echo "account: $ACCOUNT ($(printf '%s' "$ACCOUNTS" | json "j.result.find(a=>a.id===\"$ACCOUNT\").name"))"

# Every selectable permission group, split by the resource scope it applies to.
GROUPS_JSON=$(cf "$API/accounts/$ACCOUNT/tokens/permission_groups?per_page=500")
ok "$GROUPS_JSON" || fail "permission groups: $(errors "$GROUPS_JSON")"
POLICIES=$(printf '%s' "$GROUPS_JSON" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  // Everything a deployment may need. Not what manages the account itself.
  const groups=JSON.parse(s).result.filter(g=>g.is_selectable!==false && !/billing|subscription|api tokens|members|account settings.*write|super administrator/i.test(g.name));
  const account=groups.filter(g=>g.scopes.includes("com.cloudflare.api.account"));
  const zone=groups.filter(g=>!g.scopes.includes("com.cloudflare.api.account") && g.scopes.includes("com.cloudflare.api.account.zone"));
  const acct=process.argv[1];
  const policies=[
    {effect:"allow", permission_groups:account.map(g=>({id:g.id})), resources:{[`com.cloudflare.api.account.${acct}`]:"*"}},
    {effect:"allow", permission_groups:zone.map(g=>({id:g.id})), resources:{[`com.cloudflare.api.account.${acct}`]:{"com.cloudflare.api.account.zone.*":"*"}}},
  ];
  console.error(`permission groups: ${account.length} on the account, ${zone.length} on its zones`);
  console.log(JSON.stringify(policies));
})' "$ACCOUNT")

LIST=$(cf "$API/accounts/$ACCOUNT/tokens?per_page=100")
ok "$LIST" || fail "list tokens: $(errors "$LIST")"
EXISTING=$(printf '%s' "$LIST" | json "j.result.filter(t=>t.name===\"$NAME\").map(t=>t.id).join(\" \")")

CREATED=$(cf -X POST "$API/accounts/$ACCOUNT/tokens" -d "{\"name\":\"$NAME\",\"policies\":$POLICIES}")
ok "$CREATED" || fail "create token: $(errors "$CREATED")"
VALUE=$(printf '%s' "$CREATED" | json 'j.result.value'); NEW_ID=$(printf '%s' "$CREATED" | json 'j.result.id')
echo "created account token '$NAME' ($NEW_ID)"

# The new token must work before anything else is touched.
VERIFIED=$(curl -sS -H "Authorization: Bearer $VALUE" "$API/accounts/$ACCOUNT/tokens/verify")
[ "$(printf '%s' "$VERIFIED" | json 'j.result?.status')" = "active" ] || fail "the new token does not verify: $(errors "$VERIFIED"). It is left in place for inspection."

# Vault write through the API, from the variable: the value is never an argument.
store() {
  BODY=$(NAME="$1" VALUE="$2" PROJECT="$PLATFORM_PROJECT" node -e 'process.stdout.write(JSON.stringify({workspaceId:process.env.PROJECT,environment:"main",secretPath:"/",secretValue:process.env.VALUE}))')
  WRITTEN=$(printf '%s' "$BODY" | vault -X POST "$VAULT/$1" -d @-)
  [ -n "$(printf '%s' "$WRITTEN" | json 'j.secret?.id ?? ""')" ] && return 0
  [ "$(printf '%s' "$WRITTEN" | json 'j.statusCode')" = 400 ] || fail "vault write $1: $(printf '%s' "$WRITTEN" | json 'j.message')"
  WRITTEN=$(printf '%s' "$BODY" | vault -X PATCH "$VAULT/$1" -d @-)
  [ -n "$(printf '%s' "$WRITTEN" | json 'j.secret?.id ?? ""')" ] || fail "vault update $1: $(printf '%s' "$WRITTEN" | json 'j.message')"
}
store CLOUDFLARE_API_TOKEN "$VALUE"
store CLOUDFLARE_ACCOUNT_ID "$ACCOUNT"
unset VALUE BODY
NAMES=$(vault "$VAULT?workspaceId=$PLATFORM_PROJECT&environment=main&secretPath=/" | json 'j.secrets.map(x=>x.secretKey).join(" ")')
for N in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do printf '%s' " $NAMES " | grep -q " $N " || fail "vault: $N is not in main after the write"; done
echo "vault: main holds CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"

# Only now is the previous token useless. A failed delete leaves it active, so it is an error.
for OLD in $EXISTING; do
  DELETED=$(cf -X DELETE "$API/accounts/$ACCOUNT/tokens/$OLD")
  ok "$DELETED" || fail "delete previous token $OLD: $(errors "$DELETED"). Delete it in the Cloudflare dashboard."
  echo "deleted previous token $OLD"
done

# Best effort: remove the bootstrap token when it is a user token.
BOOT_ID=$(cf "$API/user/tokens/verify" | json 'j.result?.id ?? ""')
if [ -n "$BOOT_ID" ] && cf -X DELETE "$API/user/tokens/$BOOT_ID" | json 'j.success' | grep -q true; then
  echo "bootstrap token deleted"
else
  echo "bootstrap token not deleted: remove it in the Cloudflare dashboard"
fi
unset BOOT
