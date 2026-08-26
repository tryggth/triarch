/**
 * TRIARCH: Cyclic Edge - Synadia Cloud / NGS NATS Credentials
 * Embedded credential strings for client authentication with wss://connect.ngs.global
 */

export const NGS_USER_JWT = `eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiJENUtKWE00VVA0RkZLREpGTERRRFVLSjJYRENRQ1ZURFZYQUpHSVVLUUhWVVNJTVhJRDdBIiwiaWF0IjoxNzg3NzY0ODYzLCJpc3MiOiJBQTVXVVZZN1cyRjdBVk1ZMkVWT0JPNlVRTVVBVElZUVRFQk9SN1FMRE5MNlpQT1pITFJMT1ZXNyIsIm5hbWUiOiJzdSIsInN1YiI6IlVET0ZWR1BCUDVPVjVKUFJIQ05BTzdERldFR1kzSU5XQkFQWEVIWUo2NE5BNFkzWUQ0R0dDMkszIiwibmF0cyI6eyJwdWIiOnsiYWxsb3ciOlsiKiJdfSwic3ViIjp7ImFsbG93IjpbIioiXX0sInN1YnMiOi0xLCJkYXRhIjotMSwicGF5bG9hZCI6LTEsImlzc3Vlcl9hY2NvdW50IjoiQUFEUVYyWlRZTlNNNkNHT0Q0N0lHQ0VWVExCWE1BUzdWVlJSREM3VFRJWVpTM01aWVNISUpCNFEiLCJ0eXBlIjoidXNlciIsInZlcnNpb24iOjJ9fQ.7iKLxM_9MeBlySxY1MkqtCzkcPesTzJKB_jsAnbPHXrlRWHwcvCLfZet03WZE7Hcvpmj9OB7gso4lLfBg-XHDQ`;

export const NGS_NKEY_SEED = `SUAF2F4LYTRORMF4CFFVV7VC275LFCQ6INZP3JCL72WO5JDMUF42DRZKJ4`;

export const NGS_RAW_CREDS = `-----BEGIN NATS USER JWT-----
${NGS_USER_JWT}
------END NATS USER JWT------

************************* IMPORTANT *************************
NKEY Seed printed below can be used to sign and prove identity.
NKEYs are sensitive and should be treated as secrets.

-----BEGIN USER NKEY SEED-----
${NGS_NKEY_SEED}
------END USER NKEY SEED------

*************************************************************
`;

/**
 * Creates a nats.ws creds authenticator using the embedded credentials.
 * @param {Object} natsWsModule - The imported nats.ws module instance
 * @returns {any} Authenticator instance for nats.connect()
 */
export function getNgscAuthenticator(natsWsModule) {
  if (natsWsModule && typeof natsWsModule.credsAuthenticator === 'function') {
    const encoder = new TextEncoder();
    return natsWsModule.credsAuthenticator(encoder.encode(NGS_RAW_CREDS));
  }
  return null;
}
