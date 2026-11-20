#!/bin/bash
# Regenerate the SDK from the output of the "Generate SDKs" workflow in https://github.com/1080network/proto.
#
# Usage: scripts/update-from-proto.sh <version> <generated-dir>
#   <version>        release tag the code was generated from: vX.Y.Z or vX.Y.Z-preN
#   <generated-dir>  the downloaded workflow artifact (the directory containing node/)
#
# Download the generated code for a release with:
#   gh run download <run-id> -R 1080network/proto -n generated-sdks-<version>
set -euo pipefail

VERSION=${1:?usage: $0 <version> <generated-dir>}
GEN=${2:?usage: $0 <version> <generated-dir>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

if [[ ! "$VERSION" =~ ^v([0-9]+\.[0-9]+\.[0-9]+(-pre[0-9]+)?)$ ]]; then
    echo "version '$VERSION' must look like v1.2.3 or v1.2.3-pre0" >&2
    exit 1
fi
NPM_VERSION=${BASH_REMATCH[1]}   # npm versions drop the leading v
if [[ ! -d "$GEN/node/mica/issuer" ]]; then
    echo "'$GEN' does not look like generated output (expected node/mica/issuer)" >&2
    exit 1
fi

echo "Laying out $VERSION ($NPM_VERSION) from $GEN"
# Generated code only: hand-written code (index.ts, mtls.ts, tests) is left alone.
C=$ROOT/packages/common/src
rm -rf "$C/mica" "$C/micashared" "$C/validate" "$C/google"
mkdir -p "$C/mica"
# Common: shared messages, plus the validate and google protos they import
cp -r "$GEN/node/micashared" "$GEN/node/validate" "$GEN/node/google" "$C/"
cp -r "$GEN/node/mica/common" "$GEN/node/mica/member" "$C/mica/"

# The role packages import shared code from @1080network/mica-common, not by relative path.
# Rewrite against the full generated tree, then keep only each role's own files.
for role in issuer acceptor; do
    TREE=$(mktemp -d)
    cp -r "$GEN/node/." "$TREE/"
    node "$ROOT/scripts/rewrite-imports.mjs" "$TREE" "mica/$role"
    rm -rf "$ROOT/packages/$role/src/mica" && mkdir -p "$ROOT/packages/$role/src"
    cp -r "$TREE/mica" "$ROOT/packages/$role/src/"
    rm -rf "$ROOT/packages/$role/src/mica/common" "$ROOT/packages/$role/src/mica/member"
    for other in issuer acceptor; do [[ $other != $role ]] && rm -rf "$ROOT/packages/$role/src/mica/$other"; done
    rm -rf "$TREE"
done

for p in common issuer acceptor; do
    (cd "$ROOT/packages/$p" && node -e "
const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json'));
p.version = '$NPM_VERSION';
if (p.dependencies['@1080network/mica-common']) p.dependencies['@1080network/mica-common'] = '$NPM_VERSION';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');")
done

cd "$ROOT"
npm install --no-audit --no-fund
npm run build
npm test

# Pack the tarballs, install them into an empty project and use them, as a client would
PACK=$(mktemp -d)
for p in common issuer acceptor; do npm pack -w "packages/$p" --pack-destination "$PACK" >/dev/null; done
CONSUMER=$(mktemp -d)
(cd "$CONSUMER" && npm init -y >/dev/null && npm install --no-audit --no-fund "$PACK"/*.tgz >/dev/null \
    && node -e "
const { IssuerToMicaServiceClient, createMtlsClient } = require('@1080network/mica-issuer');
const { AcceptorToMicaServiceClient } = require('@1080network/mica-acceptor');
const { PingRequest } = require('@1080network/mica-common/mica/member/ping/v1/ping_service');
console.log('consumer OK:', typeof IssuerToMicaServiceClient, typeof AcceptorToMicaServiceClient, typeof createMtlsClient, typeof PingRequest.fromPartial);")
mkdir -p "$ROOT/artifacts" && cp "$PACK"/*.tgz "$ROOT/artifacts/"
rm -rf "$PACK" "$CONSUMER"
echo "Done: packages in artifacts/ ($NPM_VERSION)."
