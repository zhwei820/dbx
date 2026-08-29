import { describe, expect, it } from "vitest";
import { mysqlClientCommandForConnection, replaceConnectionEndpoint, supportsConnectionEndpointReplacement } from "@/lib/connection/connectionEndpointReplace";
import type { ConnectionConfig } from "@/types/database";

function mysqlConnection(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: "conn-1",
    name: "Prod TMS",
    db_type: "mysql",
    driver_profile: "mysql",
    driver_label: "MySQL",
    host: "10.0.0.1",
    port: 3306,
    username: "app",
    password: "old-secret",
    database: "shop",
    ...overrides,
  };
}

describe("connection endpoint replacement support", () => {
  it("is offered for the mysql family only", () => {
    expect(supportsConnectionEndpointReplacement(mysqlConnection())).toBe(true);
    expect(supportsConnectionEndpointReplacement(mysqlConnection({ driver_profile: "mariadb", driver_label: "MariaDB" }))).toBe(true);
    expect(supportsConnectionEndpointReplacement(mysqlConnection({ db_type: "postgres" }))).toBe(false);
    expect(supportsConnectionEndpointReplacement(undefined)).toBe(false);
  });
});

describe("mysql client command rendering", () => {
  it("renders the command the parser accepts back", () => {
    expect(mysqlClientCommandForConnection(mysqlConnection({ host: "localhost", port: 32883, username: "root", password: "123456", database: "tms" }))).toBe("mycli -hlocalhost -P32883 -uroot -p123456 tms");
  });

  it("quotes values that would not survive the shell", () => {
    expect(mysqlClientCommandForConnection(mysqlConnection({ host: "db host", password: "pa'ss", database: "my db" }))).toBe(`mycli -h'db host' -P3306 -uapp -p'pa'"'"'ss' 'my db'`);
  });

  it("omits a password the connection is not allowed to keep", () => {
    expect(mysqlClientCommandForConnection(mysqlConnection({ save_password: false }))).toBe("mycli -h10.0.0.1 -P3306 -uapp shop");
  });

  it("round-trips through the connection URL parser", () => {
    const config = mysqlConnection({ host: "localhost", port: 32883, username: "root", password: "p a$$", database: "tms" });
    const replaced = replaceConnectionEndpoint(config, mysqlClientCommandForConnection(config));
    expect(replaced).toMatchObject({ ok: true, config: { host: "localhost", port: 32883, username: "root", password: "p a$$", database: "tms" } });
  });
});

describe("replacing a connection endpoint", () => {
  it("replaces host, port, credentials and database from a mycli command", () => {
    const result = replaceConnectionEndpoint(mysqlConnection(), "mycli -hlocalhost -P32883 -uroot -p123456 tms");
    expect(result).toMatchObject({
      ok: true,
      config: { host: "localhost", port: 32883, username: "root", password: "123456", database: "tms" },
    });
  });

  it("keeps the connection identity and advanced settings", () => {
    const config = mysqlConnection({
      driver_profile: "mariadb",
      driver_label: "MariaDB",
      note: "shared staging box",
      transport_layers: [{ type: "ssh", id: "bastion", enabled: true, host: "bastion.internal", port: 22, user: "ops" }],
      connect_timeout_secs: 42,
      ca_cert_path: "/etc/ssl/ca.pem",
    });
    const result = replaceConnectionEndpoint(config, "mysql -h db.internal -P 3307 -u root -psecret shop");
    expect(result).toMatchObject({
      ok: true,
      config: {
        id: "conn-1",
        name: "Prod TMS",
        driver_profile: "mariadb",
        driver_label: "MariaDB",
        note: "shared staging box",
        transport_layers: config.transport_layers,
        connect_timeout_secs: 42,
        ca_cert_path: "/etc/ssl/ca.pem",
      },
    });
  });

  it("accepts a plain connection URL too", () => {
    const result = replaceConnectionEndpoint(mysqlConnection(), "mysql://root:pw@db.example.com:3307/analytics");
    expect(result).toMatchObject({ ok: true, config: { host: "db.example.com", port: 3307, username: "root", password: "pw", database: "analytics" } });
  });

  it("applies the mysql client defaults for an omitted host and port", () => {
    const result = replaceConnectionEndpoint(mysqlConnection({ host: "10.0.0.1", port: 32883 }), "mycli -uroot -ppw tms");
    expect(result).toMatchObject({ ok: true, config: { host: "localhost", port: 3306 } });
  });

  it("keeps the configured credentials when the command carries none", () => {
    // A bare `-p` means "prompt me", and an omitted -u falls back to the OS user:
    // neither is a value to replace the saved credential with.
    const result = replaceConnectionEndpoint(mysqlConnection(), "mysql -h db.internal -p tms");
    expect(result).toMatchObject({ ok: true, config: { host: "db.internal", username: "app", password: "old-secret", database: "tms" } });
  });

  it("keeps the configured database when the command names none", () => {
    const result = replaceConnectionEndpoint(mysqlConnection(), "mycli -hdb.internal -uroot -ppw");
    expect(result).toMatchObject({ ok: true, config: { database: "shop" } });
  });

  it("keeps url params and ssl that the command does not mention", () => {
    const config = mysqlConnection({ ssl: true, url_params: "charset=utf8mb4" });
    const result = replaceConnectionEndpoint(config, "mycli -hdb.internal -uroot -ppw tms");
    expect(result).toMatchObject({ ok: true, config: { ssl: true, url_params: "charset=utf8mb4" } });
  });

  it("adopts an explicit charset from the command", () => {
    const result = replaceConnectionEndpoint(mysqlConnection(), "mycli -hdb.internal -uroot -ppw --default-character-set=utf8mb4 tms");
    expect(result).toMatchObject({ ok: true, config: { url_params: "charset=utf8mb4" } });
  });

  it("rejects an empty input", () => {
    expect(replaceConnectionEndpoint(mysqlConnection(), "   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("reports an unparsable input", () => {
    expect(replaceConnectionEndpoint(mysqlConnection(), "mycli --version")).toMatchObject({ ok: false, reason: "unparsable" });
  });

  it("refuses a connection string for another database family", () => {
    expect(replaceConnectionEndpoint(mysqlConnection(), "postgresql://root:pw@db.example.com:5432/shop")).toMatchObject({ ok: false, reason: "db-type-mismatch", driverLabel: "PostgreSQL" });
  });
});
