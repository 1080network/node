# Mica SDK for Node.js and TypeScript

Client libraries for the [Mica](https://mica.io) network. Mica's API is [gRPC](https://grpc.io) over mutual TLS; the
messages and clients in this repository are generated from the [public protos](https://github.com/1080network/proto)
and use [`@grpc/grpc-js`](https://www.npmjs.com/package/@grpc/grpc-js). Written in TypeScript, with type declarations,
and works from plain JavaScript too. Node.js 20 or later.

## Which package do I need?

Each role is its own package, so you only install the code for the roles you play.

| Package | Use it if you are |
| --- | --- |
| `@1080network/mica-issuer` | an issuer |
| `@1080network/mica-acceptor` | an acceptor |
| `@1080network/mica-common` | everyone: shared messages and the mutual TLS helper. Installed automatically by the two above |

Versions match the proto release: `v2.0.0-pre0` is `2.0.0-pre0` (pre-releases are installed by naming the version).

## Installing

The packages are published to the [GitHub Packages npm registry](https://github.com/orgs/1080network/packages?ecosystem=npm).
GitHub requires authentication to read from it, even for public packages: create a personal access token with the
`read:packages` scope and add this to your project's (or your user's) `.npmrc`:

```
@1080network:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

```bash
npm install @1080network/mica-issuer@2.0.0-pre0    # or mica-acceptor
```

## Connecting

Mica uses mutual TLS. You need the root CA, and the client certificate and key Mica issued to you, as PEM files. The
server certificate is verified against the root CA and its host name, and the client presents your certificate.

For example, to call the ping service, which every role has (it lives in the common package):

```ts
import { createMtlsClient, credentialsFromFiles } from "@1080network/mica-common";
import { PingRequest, PingServiceClient } from "@1080network/mica-common/mica/member/ping/v1/ping_service";

const credentials = credentialsFromFiles("rootca.crt", "client.crt", "client.key");
const ping = createMtlsClient(PingServiceClient, "api.example.mica.io:443", credentials);

ping.ping(PingRequest.fromPartial({}), (err, response) => {
  if (err) throw err;
  console.log(response.status);
  ping.close();
});
```

Every generated message and client is importable by its path inside the package, for example
`@1080network/mica-issuer/mica/issuer/service/v2/issuer_to_mica_service`. Use `createMtlsClient` with any of the
generated `...Client` classes.

`examples/ping.js` is a complete program that connects and calls `Ping`, a good first check that your certificates and
network path work:

```bash
node examples/ping.js api.example.mica.io:443 rootca.crt client.crt client.key
```

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/common`, `packages/issuer`, `packages/acceptor` | one npm package each; everything under `src/mica`, `src/micashared`, `src/validate` and `src/google` is **generated** |
| `packages/common/src/mtls.ts` | hand-written mutual TLS helper |
| `packages/common/test` | tests, including a real mutual TLS call to an in-process server |
| `examples/` | runnable examples |
| `scripts/update-from-proto.sh` | regenerates the SDK for a proto release, builds, tests, and checks the packed packages from an empty project |

The generated code imports its dependencies by relative path, so `scripts/rewrite-imports.mjs` rewrites the role
packages' imports of shared code to `@1080network/mica-common`.

## Releasing (maintainers)

1. Run the **Generate SDKs** workflow in [1080network/proto](https://github.com/1080network/proto/actions) for the release tag.
2. Download its output: `gh run download <run-id> -R 1080network/proto -n generated-sdks-<version>`.
3. Run `scripts/update-from-proto.sh <version> <download-dir>`. It lays the generated code into the packages, sets the versions, builds, tests, and installs the packed tarballs into an empty project to check they work.
4. Open a pull request with the changes and merge it.
5. Publish a GitHub release whose tag is the version (for example `v2.0.0-pre0`). The **Publish packages** workflow publishes all three packages to GitHub Packages.
