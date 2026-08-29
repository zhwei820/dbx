import type { ConnectionConfig } from "@/types/database";
import { parseConnectionUrl, type ParsedConnectionUrl } from "@/lib/connection/connectionUrl";

/**
 * "Replace connection" is the inverse of "copy connection details": users keep a
 * `mycli -hlocalhost -P32883 -uroot -p123456 tms` line around, and want an
 * existing connection to point at it without walking the whole edit dialog.
 *
 * It is offered for the mysql family only, because that is the family whose
 * client command DBX both emits and parses.
 */
export function supportsConnectionEndpointReplacement(config: ConnectionConfig | undefined): boolean {
  return config?.db_type === "mysql";
}

function shellQuoteCliValue(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Renders a connection as the mysql-family client command it was (or could have
 * been) pasted from. Shared by the clipboard action and by the replace dialog,
 * so what DBX hands out is exactly what it accepts back.
 */
export function mysqlClientCommandForConnection(config: ConnectionConfig): string {
  const password = config.save_password === false ? "" : config.password;
  const args = ["mycli"];
  if (config.host) args.push(`-h${shellQuoteCliValue(config.host)}`);
  if (config.port > 0) args.push(`-P${config.port}`);
  if (config.username) args.push(`-u${shellQuoteCliValue(config.username)}`);
  if (password) args.push(`-p${shellQuoteCliValue(password)}`);
  if (config.database) args.push(shellQuoteCliValue(config.database));
  return args.join(" ");
}

export type ConnectionEndpointReplacement = { ok: true; config: ConnectionConfig } | { ok: false; reason: "empty" } | { ok: false; reason: "unparsable"; message: string } | { ok: false; reason: "db-type-mismatch"; driverLabel: string };

/**
 * Builds the replacement config from a pasted client command or connection URL.
 *
 * Only the endpoint is replaced. Driver profile, connection name, SSH/tunnel
 * layers, timeouts and TLS material are kept: a client command carries none of
 * them, so adopting the parser's defaults would silently drop settings the user
 * never mentioned.
 */
export function replaceConnectionEndpoint(config: ConnectionConfig, input: string): ConnectionEndpointReplacement {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  let parsed: ParsedConnectionUrl;
  try {
    parsed = parseConnectionUrl(trimmed, config.driver_profile);
  } catch (error: any) {
    return { ok: false, reason: "unparsable", message: error?.message || String(error) };
  }
  if (parsed.dbType !== config.db_type) {
    return { ok: false, reason: "db-type-mismatch", driverLabel: parsed.driverLabel };
  }

  return {
    ok: true,
    config: {
      ...config,
      // mysql clients default to localhost:3306, so an omitted -h/-P is itself a value.
      host: parsed.host,
      port: parsed.port,
      // An omitted -u and a bare -p (which means "prompt me") carry nothing to
      // replace with, so the configured credential stays.
      username: parsed.username || config.username,
      password: parsed.password || config.password,
      database: parsed.database?.trim() || config.database,
      ssl: parsed.ssl || config.ssl,
      url_params: parsed.urlParams || config.url_params,
    },
  };
}
