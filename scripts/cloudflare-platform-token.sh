#!/bin/bash
# Create the single Cloudflare credential of the platform and store it in the vault.
#
# One account-owned API token, allowed on every selectable account and zone permission
# group (billing excluded), stored as CLOUDFLARE_API_TOKEN in the platform project for
# the development and production environments. Pulumi and Wrangler read it from there.
# Run once. Run again to rotate: a new token is created and stored, the old one is
# deleted at the end.
#
# Needs: a bootstrap token with "Account API Tokens Write" and "Account Settings Read",
# created in the Cloudflare dashboard. It is pasted at a prompt that does not echo, and
# it is deleted by this script if it is a user token. No token value is ever printed.
set -euo pipefail

PLATFORM_PROJECT=${INFISICAL_PLATFORM_PROJECT_ID:-721a5f71-3801-40e2-a06d-a4a9b431e1c7}
NAME=${1:-nextnode-platform}
API=https://api.cloudflare.com/client/v4

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s||"{}");const v=new Function("j","return ("+process.argv[1]+")")(j);console.log(v==null?"":typeof v==="string"?v:JSON.stringify(v))})' "$1"; }
cf() { curl -sS -H "Authorization: Bearer $BOOT" -H 'content-type: application/json' "$@"; }
fail() { echo "error: $*" >&2; exit 1; }

command -v infisical >/dev/null || fail "infisical CLI not installed"
infisical user get token --plain >/dev/null 2>&1 || fail "no Infisical session, run: infisical login"

printf 'Bootstrap Cloudflare token (not echoed): '; read -rs BOOT; echo
[ -n "$BOOT" ] || fail "empty token"

ACCOUNT=$(cf "$API/accounts" | json 'j.result?.[0]?.id ?? ""')
[ -n "$ACCOUNT" ] || fail "the bootstrap token cannot list the account (needs Account Settings Read)"
echo "account: $ACCOUNT"

# Every selectable permission group, split by the resource scope it applies to.
GROUPS_JSON=$(cf "$API/accounts/$ACCOUNT/tokens/permission_groups?per_page=500")
[ "$(printf '%s' "$GROUPS_JSON" | json 'j.success')" = "true" ] || fail "permission groups: $(printf '%s' "$GROUPS_JSON" | json 'j.errors?.map(e=>e.message).join("; ")')"
POLICIES=$(printf '%s' "$GROUPS_JSON" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const groups=JSON.parse(s).result.filter(g=>g.is_selectable!==false && !/billing|subscription/i.test(g.name));
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

EXISTING=$(cf "$API/accounts/$ACCOUNT/tokens?per_page=100" | json "(j.result||[]).filter(t=>t.name===\"$NAME\").map(t=>t.id).join(\" \")")

CREATED=$(cf -X POST "$API/accounts/$ACCOUNT/tokens" -d "{\"name\":\"$NAME\",\"policies\":$POLICIES}")
[ "$(printf '%s' "$CREATED" | json 'j.success')" = "true" ] || fail "create token: $(printf '%s' "$CREATED" | json 'j.errors?.map(e=>e.message).join("; ")')"
VALUE=$(printf '%s' "$CREATED" | json 'j.result.value'); NEW_ID=$(printf '%s' "$CREATED" | json 'j.result.id')
echo "created account token '$NAME' ($NEW_ID)"

for ENV in development production; do
  infisical secrets set CLOUDFLARE_API_TOKEN="$VALUE" CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" --env="$ENV" --projectId="$PLATFORM_PROJECT" --silent >/dev/null
  echo "vault: $ENV has $(infisical secrets get CLOUDFLARE_API_TOKEN --env="$ENV" --projectId="$PLATFORM_PROJECT" --plain --silent | wc -c | tr -d ' ') characters in CLOUDFLARE_API_TOKEN"
done
unset VALUE

for OLD in $EXISTING; do
  cf -X DELETE "$API/accounts/$ACCOUNT/tokens/$OLD" >/dev/null && echo "deleted previous token $OLD"
done

# Best effort: remove the bootstrap token when it is a user token.
BOOT_ID=$(cf "$API/user/tokens/verify" | json 'j.result?.id ?? ""')
if [ -n "$BOOT_ID" ] && cf -X DELETE "$API/user/tokens/$BOOT_ID" | json 'j.success' | grep -q true; then
  echo "bootstrap token deleted"
else
  echo "bootstrap token not deleted: remove it in the Cloudflare dashboard"
fi
unset BOOT
