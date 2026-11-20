import { readFileSync } from "node:fs";
import * as grpc from "@grpc/grpc-js";

/**
 * PEM material for a mutual TLS connection to Mica.
 *
 * Every connection to Mica uses mutual TLS: the client presents a certificate issued by Mica and verifies Mica's
 * server certificate (including its host name) against the root certificate authority Mica provides.
 */
export interface MtlsCredentials {
  /** Root certificate(s) used to verify Mica's server certificate. */
  certificateAuthorities: Buffer | string;
  /** The client certificate chain issued by Mica. */
  certificate: Buffer | string;
  /** The private key for `certificate`. */
  key: Buffer | string;
}

/** Reads the credentials from PEM files on disk. */
export function credentialsFromFiles(certificateAuthoritiesFile: string, certificateFile: string, keyFile: string): MtlsCredentials {
  return {
    certificateAuthorities: readFileSync(certificateAuthoritiesFile),
    certificate: readFileSync(certificateFile),
    key: readFileSync(keyFile),
  };
}

/** Builds the gRPC channel credentials for the given mutual TLS material. */
export function channelCredentials(credentials: MtlsCredentials): grpc.ChannelCredentials {
  return grpc.credentials.createSsl(
    toBuffer(credentials.certificateAuthorities),
    toBuffer(credentials.key),
    toBuffer(credentials.certificate),
  );
}

/** The constructor shape of every generated gRPC client. */
export type ClientConstructor<T> = new (
  address: string,
  credentials: grpc.ChannelCredentials,
  options?: Partial<grpc.ClientOptions>,
) => T;

/**
 * Creates a generated gRPC client for `target` (for example `api.example.mica.io:443`) that connects with mutual TLS.
 *
 *     const ping = createMtlsClient(PingServiceClient, "api.example.mica.io:443", credentials);
 *
 * The caller owns the client and should call `close()` when done.
 */
export function createMtlsClient<T>(
  clientConstructor: ClientConstructor<T>,
  target: string,
  credentials: MtlsCredentials,
  options?: Partial<grpc.ClientOptions>,
): T {
  return new clientConstructor(target, channelCredentials(credentials), options);
}

function toBuffer(value: Buffer | string): Buffer {
  return typeof value === "string" ? Buffer.from(value) : value;
}
