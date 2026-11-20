// Makes real mutual TLS Ping calls to an in-process server, using certificates generated for the test.
import "reflect-metadata"; // required by @peculiar/x509
import assert from "node:assert/strict";
import { test } from "node:test";
import * as grpc from "@grpc/grpc-js";
import * as x509 from "@peculiar/x509";
import { PingRequest, PingResponse_Status, PingServiceClient, PingServiceService } from "../src/mica/member/ping/v1/ping_service";
import { createMtlsClient } from "../src/mtls";

const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
const crypto = globalThis.crypto;

interface Identity {
  certPem: string;
  keyPem: string;
  cert: x509.X509Certificate;
  privateKey: CryptoKey;
}

async function newIdentity(name: string, ca?: Identity): Promise<Identity> {
  const keys = (await crypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
  const now = Date.now();
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString("hex"),
    subject: `CN=${name}`,
    issuer: ca ? ca.cert.subject : `CN=${name}`,
    notBefore: new Date(now - 60_000),
    notAfter: new Date(now + 3_600_000),
    signingAlgorithm: alg,
    publicKey: keys.publicKey,
    signingKey: ca ? ca.privateKey : keys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(!ca, undefined, true),
      new x509.SubjectAlternativeNameExtension([
        { type: "dns", value: "localhost" },
        { type: "ip", value: "127.0.0.1" },
      ]),
    ],
  });
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  const keyPem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { certPem: cert.toString("pem"), keyPem, cert, privateKey: keys.privateKey };
}

async function startServer(ca: Identity, server: Identity): Promise<{ target: string; stop: () => void }> {
  const grpcServer = new grpc.Server();
  grpcServer.addService(PingServiceService, {
    ping: (_call: unknown, callback: grpc.sendUnaryData<any>) =>
      callback(null, { status: PingResponse_Status.STATUS_SUCCESS, serverTime: undefined, buildVersion: "", buildSha: "", buildTime: "", serviceType: "test", serverStartTime: undefined }),
  } as any);
  const credentials = grpc.ServerCredentials.createSsl(
    Buffer.from(ca.certPem),
    [{ private_key: Buffer.from(server.keyPem), cert_chain: Buffer.from(server.certPem) }],
    true, // require a client certificate
  );
  const port = await new Promise<number>((resolve, reject) =>
    grpcServer.bindAsync("127.0.0.1:0", credentials, (err, p) => (err ? reject(err) : resolve(p))),
  );
  return { target: `localhost:${port}`, stop: () => grpcServer.forceShutdown() };
}

function ping(client: PingServiceClient): Promise<{ status: PingResponse_Status }> {
  return new Promise((resolve, reject) =>
    client.ping(PingRequest.fromPartial({}), { deadline: Date.now() + 10_000 }, (err, response) => (err ? reject(err) : resolve(response))),
  );
}

test("a ping succeeds over mutual TLS and a server from an unknown authority is rejected", async () => {
  const ca = await newIdentity("test ca");
  const server = await newIdentity("server", ca);
  const client = await newIdentity("client", ca);
  const { target, stop } = await startServer(ca, server);
  try {
    const trusting = createMtlsClient(PingServiceClient, target, {
      certificateAuthorities: ca.certPem,
      certificate: client.certPem,
      key: client.keyPem,
    });
    try {
      assert.equal((await ping(trusting)).status, PingResponse_Status.STATUS_SUCCESS);
    } finally {
      trusting.close();
    }

    const otherCa = await newIdentity("other ca");
    const untrusting = createMtlsClient(PingServiceClient, target, {
      certificateAuthorities: otherCa.certPem,
      certificate: client.certPem,
      key: client.keyPem,
    });
    try {
      await assert.rejects(ping(untrusting));
    } finally {
      untrusting.close();
    }
  } finally {
    stop();
  }
});
