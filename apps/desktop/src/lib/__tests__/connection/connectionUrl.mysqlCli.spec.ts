import { describe, expect, it } from "vitest";
import { parseConnectionUrl } from "@/lib/connection/connectionUrl";

describe("mysql-family CLI commands", () => {
  it("parses a mycli command with attached option values", () => {
    expect(parseConnectionUrl("mycli -hlocalhost -P32804 -uroot -p123456 tms")).toMatchObject({
      dbType: "mysql",
      driverProfile: "mysql",
      driverLabel: "MySQL",
      host: "localhost",
      port: 32804,
      username: "root",
      password: "123456",
      database: "tms",
      urlParams: "",
      ssl: false,
    });
  });

  it("parses a mysql command with detached option values", () => {
    expect(parseConnectionUrl("mysql -h 127.0.0.1 -P 3307 -u admin -psecret -D shop")).toMatchObject({
      host: "127.0.0.1",
      port: 3307,
      username: "admin",
      password: "secret",
      database: "shop",
    });
  });

  it("parses long option forms", () => {
    expect(parseConnectionUrl("mysql --host=db.example.com --port=3308 --user=root --password=pw --database=app --default-character-set=utf8mb4")).toMatchObject({
      host: "db.example.com",
      port: 3308,
      username: "root",
      password: "pw",
      database: "app",
      urlParams: "charset=utf8mb4",
    });
  });

  it("falls back to the mysql client defaults when host and port are omitted", () => {
    expect(parseConnectionUrl("mysql -uroot -p123456 tms")).toMatchObject({
      host: "localhost",
      port: 3306,
      username: "root",
      password: "123456",
      database: "tms",
    });
  });

  it("keeps the password empty when the mysql client would prompt for it", () => {
    expect(parseConnectionUrl("mysql -h db.example.com -u root -p")).toMatchObject({
      host: "db.example.com",
      username: "root",
      password: "",
      database: undefined,
    });
    expect(parseConnectionUrl("mysql -h db.example.com -u root --password")).toMatchObject({ password: "" });
  });

  it("accepts a detached password for mycli, which requires the value", () => {
    expect(parseConnectionUrl("mycli -h db.example.com -u root -p 123456 shop")).toMatchObject({
      host: "db.example.com",
      username: "root",
      password: "123456",
      database: "shop",
    });
  });

  it("keeps quoted values intact, including the shell escaping DBX copies to the clipboard", () => {
    expect(parseConnectionUrl(`mycli -h'db host' -P3306 -uroot -p'pa'"'"'ss'`)).toMatchObject({
      host: "db host",
      username: "root",
      password: "pa'ss",
    });
    expect(parseConnectionUrl(`mysql -h db -u root -p"se cret" --database "my app"`)).toMatchObject({
      password: "se cret",
      database: "my app",
    });
  });

  it("uses the MariaDB profile for the mariadb client", () => {
    expect(parseConnectionUrl("mariadb -hdb -uroot -ppw app")).toMatchObject({
      dbType: "mysql",
      driverProfile: "mariadb",
      driverLabel: "MariaDB",
      port: 3306,
      database: "app",
    });
  });

  it("accepts an absolute command path", () => {
    expect(parseConnectionUrl("/usr/local/mysql/bin/mysql -hdb -uroot -ppw")).toMatchObject({ host: "db", username: "root", password: "pw" });
    expect(parseConnectionUrl("C:\\mysql\\bin\\mysql.exe -hdb -uroot")).toMatchObject({ host: "db", username: "root" });
    expect(parseConnectionUrl(`"C:\\Program Files\\MySQL\\bin\\mysql.exe" -hdb -uroot`)).toMatchObject({ host: "db", username: "root" });
  });

  it("unescapes a backslash-escaped space", () => {
    expect(parseConnectionUrl("mysql -hdb -uroot -pmy\\ pass")).toMatchObject({ password: "my pass" });
  });

  it("strips a copied shell prompt marker", () => {
    expect(parseConnectionUrl("$ mycli -hdb -P3307 -uroot -ppw")).toMatchObject({ host: "db", port: 3307, password: "pw" });
  });

  it("does not mistake the value of an unrelated option for the database", () => {
    expect(parseConnectionUrl("mysql -e 'select 1' -h db -u root -ppw")).toMatchObject({ host: "db", username: "root", database: undefined });
    expect(parseConnectionUrl("mysql --socket /tmp/mysql.sock -u root -ppw shop")).toMatchObject({ username: "root", database: "shop" });
  });

  it("follows the mysql client rule that a bare -p never swallows the database", () => {
    expect(parseConnectionUrl("mysql -h db -u root -p shop")).toMatchObject({ host: "db", username: "root", password: "", database: "shop" });
  });

  it("treats everything after -- as positional", () => {
    expect(parseConnectionUrl("mysql -uroot -ppw -- shop")).toMatchObject({ username: "root", password: "pw", database: "shop" });
  });

  it("ignores bundled boolean flags", () => {
    expect(parseConnectionUrl("mysql -tA -hdb -uroot -ppw shop")).toMatchObject({ host: "db", username: "root", password: "pw", database: "shop" });
  });

  it("reads TLS intent from the ssl options", () => {
    expect(parseConnectionUrl("mysql -hdb -uroot -ppw --ssl-mode=REQUIRED").ssl).toBe(true);
    expect(parseConnectionUrl("mysql -hdb -uroot -ppw --ssl-mode VERIFY_IDENTITY").ssl).toBe(true);
    expect(parseConnectionUrl("mysql -hdb -uroot -ppw --ssl-mode=DISABLED").ssl).toBe(false);
    expect(parseConnectionUrl("mysql -hdb -uroot -ppw --ssl").ssl).toBe(true);
    expect(parseConnectionUrl("mysql -hdb -uroot -ppw --ssl --skip-ssl").ssl).toBe(false);
  });

  it("enables TLS for TiDB Cloud hosts", () => {
    expect(parseConnectionUrl("mysql -h gateway01.us-west-2.prod.aws.tidbcloud.com -P 4000 -u root -ppw test").ssl).toBe(true);
  });

  it("parses a DSN passed to mycli as a positional argument", () => {
    expect(parseConnectionUrl("mycli mysql://root:pw@db.example.com:3307/shop?charset=utf8mb4")).toMatchObject({
      dbType: "mysql",
      host: "db.example.com",
      port: 3307,
      username: "root",
      password: "pw",
      database: "shop",
      urlParams: "charset=utf8mb4",
    });
  });

  it("lets explicit options override a DSN positional argument", () => {
    expect(parseConnectionUrl("mycli mysql://root:pw@db.example.com/shop -P3307 -uadmin")).toMatchObject({
      host: "db.example.com",
      port: 3307,
      username: "admin",
      password: "pw",
      database: "shop",
    });
  });

  it("keeps the selected driver profile for mysql-compatible products", () => {
    expect(parseConnectionUrl("mycli -hdb -P9030 -uroot -ppw ssb", "doris")).toMatchObject({ dbType: "mysql", host: "db", port: 9030 });
  });

  it("rejects a command with no connection information", () => {
    expect(() => parseConnectionUrl("mysql")).toThrow("Invalid connection URL");
    expect(() => parseConnectionUrl("mycli --version")).toThrow("Invalid connection URL");
  });

  it("rejects an invalid port", () => {
    expect(() => parseConnectionUrl("mycli -hdb -P abc -uroot")).toThrow("Invalid port in connection command: abc");
    expect(() => parseConnectionUrl("mycli -hdb -P99999 -uroot")).toThrow("Invalid port in connection command: 99999");
  });

  it("still parses connection URLs whose scheme matches a client name", () => {
    expect(parseConnectionUrl("mysql://root:pw@db.example.com:3307/shop")).toMatchObject({ host: "db.example.com", port: 3307, username: "root", password: "pw", database: "shop" });
  });
});
