// Connects to Mica with mutual TLS and calls Ping, a good first check that your certificates and network path work.
//
//   node examples/ping.js api.example.mica.io:443 rootca.crt client.crt client.key
//
// Requires the packages to be installed (npm install @1080network/mica-common) or, in this repository, built (npm run build).
const { createMtlsClient, credentialsFromFiles } = require("@1080network/mica-common");
const { PingRequest, PingServiceClient, PingResponse_Status } = require("@1080network/mica-common/mica/member/ping/v1/ping_service");

const [target, ca, cert, key] = process.argv.slice(2);
if (!key) {
  console.error("usage: ping.js <host:port> <rootca.crt> <client.crt> <client.key>");
  process.exit(1);
}

const client = createMtlsClient(PingServiceClient, target, credentialsFromFiles(ca, cert, key));
client.ping(PingRequest.fromPartial({}), { deadline: Date.now() + 15_000 }, (err, response) => {
  client.close();
  if (err) {
    console.error("ping failed:", err.message);
    process.exit(1);
  }
  console.log(`status=${PingResponse_Status[response.status]} service=${response.serviceType} version=${response.buildVersion}`);
});
