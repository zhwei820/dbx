import type { ConnectionConfig, DatabaseType } from "@/types/database";
import { h2JdbcUrlHasPasswordParam, h2JdbcUrlHasUserParam, parseH2JdbcUrl } from "@/lib/database/h2Connection";
import { damengSslFormConfig } from "@/lib/database/damengSslOptions";

export interface ParsedConnectionUrl {
  name?: string;
  dbType: DatabaseType;
  driverProfile: string;
  driverLabel: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
  urlParams: string;
  ssl: boolean;
  connectionString?: string;
  oracleConnectionType?: "service_name" | "sid";
  useMongoUrl?: boolean;
  portExplicit?: boolean;
  apiPath?: string;
  basePath?: string;
}

export type ConnectionProfile = {
  type: DatabaseType;
  profile: string;
  label: string;
  defaultPort: number;
};

const SCHEME_PROFILES: Record<string, ConnectionProfile> = {
  mysql: { type: "mysql", profile: "mysql", label: "MySQL", defaultPort: 3306 },
  oceanbase: { type: "mysql", profile: "oceanbase", label: "OceanBase", defaultPort: 2883 },
  mariadb: { type: "mysql", profile: "mariadb", label: "MariaDB", defaultPort: 3306 },
  postgres: { type: "postgres", profile: "postgres", label: "PostgreSQL", defaultPort: 5432 },
  postgresql: { type: "postgres", profile: "postgres", label: "PostgreSQL", defaultPort: 5432 },
  cloudberry: { type: "postgres", profile: "cloudberry", label: "Apache Cloudberry", defaultPort: 5432 },
  opentenbase: { type: "postgres", profile: "opentenbase", label: "OpenTenBase", defaultPort: 11000 },
  redshift: { type: "redshift", profile: "redshift", label: "Redshift", defaultPort: 5439 },
  redis: { type: "redis", profile: "redis", label: "Redis", defaultPort: 6379 },
  rediss: { type: "redis", profile: "redis", label: "Redis", defaultPort: 6379 },
  etcd: { type: "etcd", profile: "etcd", label: "etcd", defaultPort: 2379 },
  consul: { type: "consul", profile: "consul", label: "Consul", defaultPort: 8500 },
  "nacos-v2": { type: "nacos", profile: "nacos", label: "Nacos", defaultPort: 8848 },
  "nacos-v3": { type: "nacos", profile: "nacos", label: "Nacos", defaultPort: 8848 },
  "r-nacos": { type: "nacos", profile: "nacos", label: "r-nacos", defaultPort: 8848 },
  nacos: { type: "nacos", profile: "nacos", label: "Nacos", defaultPort: 8848 },
  rnacos: { type: "nacos", profile: "nacos", label: "r-nacos", defaultPort: 8848 },
  zookeeper: { type: "zookeeper", profile: "zookeeper", label: "Apache ZooKeeper", defaultPort: 2181 },
  mongodb: { type: "mongodb", profile: "mongodb", label: "MongoDB", defaultPort: 27017 },
  "mongodb+srv": { type: "mongodb", profile: "mongodb", label: "MongoDB", defaultPort: 27017 },
  dynamodb: { type: "dynamodb", profile: "dynamodb", label: "Amazon DynamoDB", defaultPort: 443 },
  clickhouse: { type: "clickhouse", profile: "clickhouse", label: "ClickHouse", defaultPort: 8123 },
  sqlserver: { type: "sqlserver", profile: "sqlserver", label: "SQL Server", defaultPort: 1433 },
  mssql: { type: "sqlserver", profile: "sqlserver", label: "SQL Server", defaultPort: 1433 },
  oracle: { type: "oracle", profile: "oracle", label: "Oracle", defaultPort: 1521 },
  elasticsearch: { type: "elasticsearch", profile: "elasticsearch", label: "Elasticsearch", defaultPort: 9200 },
  easysearch: { type: "easysearch", profile: "easysearch", label: "Easysearch", defaultPort: 9200 },
  meilisearch: { type: "meilisearch", profile: "meilisearch", label: "Meilisearch", defaultPort: 7700 },
  qdrant: { type: "qdrant", profile: "qdrant", label: "Qdrant", defaultPort: 6333 },
  milvus: { type: "milvus", profile: "milvus", label: "Milvus", defaultPort: 19530 },
  weaviate: { type: "weaviate", profile: "weaviate", label: "Weaviate", defaultPort: 8080 },
  chromadb: { type: "chromadb", profile: "chromadb", label: "ChromaDB", defaultPort: 8000 },
  dm: { type: "dameng", profile: "dm", label: "达梦 Dameng", defaultPort: 5236 },
  dameng: { type: "dameng", profile: "dm", label: "达梦 Dameng", defaultPort: 5236 },
  kingbase: { type: "kingbase", profile: "kingbase", label: "金仓KingbaseES", defaultPort: 54321 },
  kingbase8: { type: "kingbase", profile: "kingbase", label: "金仓KingbaseES", defaultPort: 54321 },
  gaussdb: { type: "gaussdb", profile: "gaussdb", label: "GaussDB", defaultPort: 5432 },
  kwdb: { type: "kwdb", profile: "kwdb", label: "KWDB", defaultPort: 26257 },
  gbase: { type: "gbase", profile: "gbase", label: "南大通用 GBase", defaultPort: 5258 },
  "gbasedbt-sqli": { type: "gbase", profile: "gbase8s", label: "南大通用 GBase 8s", defaultPort: 9088 },
  "informix-sqli": { type: "informix", profile: "informix", label: "Informix", defaultPort: 9088 },
  yashandb: { type: "yashandb", profile: "yashandb", label: "YashanDB", defaultPort: 1688 },
  opengauss: { type: "gaussdb", profile: "opengauss", label: "openGauss", defaultPort: 5432 },
  questdb: { type: "questdb", profile: "questdb", label: "QuestDB", defaultPort: 8812 },
  tdengine: { type: "tdengine", profile: "tdengine", label: "TDengine", defaultPort: 6041 },
  "taos-ws": { type: "tdengine", profile: "tdengine", label: "TDengine", defaultPort: 6041 },
  oscar: { type: "oscar", profile: "oscar", label: "神通 OSCAR", defaultPort: 2003 },
  xugu: { type: "xugu", profile: "xugu", label: "XuguDB", defaultPort: 5138 },
  iotdb: { type: "iotdb", profile: "iotdb", label: "Apache IoTDB", defaultPort: 6667 },
  iris: { type: "iris", profile: "iris", label: "IRIS", defaultPort: 1972 },
  victoriametrics: { type: "victoriametrics", profile: "victoriametrics", label: "VictoriaMetrics", defaultPort: 8428 },
};

const OCEANBASE_ORACLE_PROFILE: ConnectionProfile = {
  type: "oceanbase-oracle",
  profile: "oceanbase-oracle",
  label: "OceanBase Oracle Mode",
  defaultPort: 2883,
};

const HTTP_SELECTED_PROFILES: Record<string, ConnectionProfile> = {
  clickhouse: SCHEME_PROFILES.clickhouse,
  dynamodb: SCHEME_PROFILES.dynamodb,
  elasticsearch: SCHEME_PROFILES.elasticsearch,
  easysearch: SCHEME_PROFILES.easysearch,
  meilisearch: SCHEME_PROFILES.meilisearch,
  qdrant: SCHEME_PROFILES.qdrant,
  milvus: SCHEME_PROFILES.milvus,
  weaviate: SCHEME_PROFILES.weaviate,
  chromadb: SCHEME_PROFILES.chromadb,
  victoriametrics: SCHEME_PROFILES.victoriametrics,
  consul: SCHEME_PROFILES.consul,
  "nacos-v2": SCHEME_PROFILES["nacos-v2"],
  "nacos-v3": SCHEME_PROFILES["nacos-v3"],
  "r-nacos": SCHEME_PROFILES["r-nacos"],
  nacos: SCHEME_PROFILES.nacos,
  rnacos: SCHEME_PROFILES.rnacos,
};

function decodeUrlPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodePercentEscapes(value: string): string {
  return value.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function encodeMongoUserInfoPart(value: string): string {
  return encodeURIComponent(decodePercentEscapes(value));
}

export function normalizeMongoConnectionString(value: string): string {
  const input = value.trim();
  if (!input) return input;

  const mongoMatch = input.match(/^(mongodb(?:\+srv)?):\/\/(?:(.+)@)?/i);
  if (!mongoMatch) return input;

  const userinfo = mongoMatch[2];
  if (!userinfo) return input;

  const [username, ...passwordParts] = userinfo.split(":");
  const password = passwordParts.join(":");
  const encodedUsername = encodeMongoUserInfoPart(username);
  const encodedPassword = password ? `:${encodeMongoUserInfoPart(password)}` : "";

  return input.replace(/^(mongodb(?:\+srv)?:\/\/)(?:(.+)@)?/i, `$1${encodedUsername}${encodedPassword}@`);
}

function parseMongoUrl(source: string): ParsedConnectionUrl | null {
  const match = source.match(/^(mongodb(?:\+srv)?):\/\/(?:(.+)@)?([^/]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return null;

  const scheme = match[1].toLowerCase();
  const userinfo = match[2] || "";
  const hosts = match[3] || "";
  const pathname = match[4] || "";
  const search = match[5] || "";

  const profile = SCHEME_PROFILES[scheme];
  if (!profile) return null;

  const [username, ...passwordParts] = decodeUrlPart(userinfo).split(":");
  const password = passwordParts.join(":");

  const firstHost = hosts.split(",")[0];
  let host: string;
  let port: number;
  if (firstHost.startsWith("[")) {
    const bracketEnd = firstHost.indexOf("]");
    host = firstHost.substring(1, bracketEnd);
    port = firstHost.substring(bracketEnd + 1).startsWith(":") ? Number(firstHost.substring(bracketEnd + 2)) || profile.defaultPort : profile.defaultPort;
  } else if (firstHost.includes(":")) {
    const colonIdx = firstHost.lastIndexOf(":");
    host = firstHost.substring(0, colonIdx);
    port = Number(firstHost.substring(colonIdx + 1)) || profile.defaultPort;
  } else {
    host = firstHost;
    port = profile.defaultPort;
  }

  const database = databaseFromPath(pathname);
  const urlParams = search.replace(/^\?/, "");

  return {
    dbType: profile.type,
    driverProfile: profile.profile,
    driverLabel: profile.label,
    host,
    port,
    username,
    password,
    database,
    urlParams,
    ssl: scheme === "mongodb+srv",
    connectionString: normalizeMongoConnectionString(source),
    useMongoUrl: true,
  };
}

function databaseFromPath(pathname: string): string | undefined {
  const value = pathname.replace(/^\/+/, "");
  if (!value) return undefined;
  return decodeUrlPart(value.split("/")[0]);
}

function dynamodbRegionFromHost(hostname: string): string | undefined {
  return hostname.toLowerCase().match(/^dynamodb(?:-fips)?\.([a-z0-9-]+)\.(?:amazonaws\.com(?:\.cn)?|api\.aws)$/)?.[1];
}

function parseZooKeeperUrl(source: string): ParsedConnectionUrl | null {
  const match = source.match(/^zookeeper:\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/i);
  if (!match) return null;

  const profile = SCHEME_PROFILES.zookeeper;
  const authority = match[1];
  const userInfoEnd = authority.lastIndexOf("@");
  const userInfo = userInfoEnd >= 0 ? authority.slice(0, userInfoEnd) : "";
  const endpointList = userInfoEnd >= 0 ? authority.slice(userInfoEnd + 1) : authority;
  const [rawUsername, ...rawPasswordParts] = userInfo.split(":");
  const username = userInfo ? decodeUrlPart(rawUsername) : "";
  const password = userInfo ? decodeUrlPart(rawPasswordParts.join(":")) : "";
  const endpoints = endpointList.split(",").map((endpoint) => endpoint.trim());
  if (endpoints.some((endpoint) => !endpoint)) throw new Error("Invalid connection URL");

  const normalizedEndpoints = endpoints.map((endpoint) => {
    let endpointUrl: URL;
    try {
      endpointUrl = new URL(`zookeeper://${endpoint}`);
    } catch {
      throw new Error("Invalid connection URL");
    }
    if (endpointUrl.username || endpointUrl.password || (endpointUrl.pathname && endpointUrl.pathname !== "/") || endpointUrl.search || endpointUrl.hash) {
      throw new Error("Invalid connection URL");
    }
    const rawHost = endpointUrl.hostname.replace(/^\[(.*)]$/, "$1");
    const host = rawHost.includes(":") ? `[${rawHost}]` : rawHost;
    const port = endpointUrl.port ? Number(endpointUrl.port) : profile.defaultPort;
    return { host: rawHost, port, connectString: `${host}:${port}` };
  });
  const chroot = match[2] && match[2] !== "/" ? match[2] : "";
  const urlParams = (match[3] || "").replace(/^\?/, "");
  const name = queryParamValue(urlParams, "name")?.trim();

  return {
    ...(name ? { name } : {}),
    dbType: profile.type,
    driverProfile: profile.profile,
    driverLabel: profile.label,
    host: normalizedEndpoints[0].host,
    port: normalizedEndpoints[0].port,
    username,
    password,
    database: undefined,
    urlParams: stripConnectionNameParam(urlParams),
    ssl: false,
    connectionString: `${normalizedEndpoints.map((endpoint) => endpoint.connectString).join(",")}${chroot}`,
  };
}

function queryParamValue(params: string, key: string): string | undefined {
  for (const part of params.split(/[&;]/)) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split("=");
    if (decodeUrlPart(rawKey).toLowerCase() === key.toLowerCase()) {
      return decodeUrlPart(rest.join("=")).trim();
    }
  }
  return undefined;
}

function queryParamLastValue(params: string, key: string): string | undefined {
  let result: string | undefined;
  for (const part of params.split(/[&;]/)) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split("=");
    if (decodeUrlPart(rawKey).toLowerCase() === key.toLowerCase()) {
      result = decodeUrlPart(rest.join("=")).trim();
    }
  }
  return result;
}

function extractHiveStructuredParams(params: string): { username?: string; password?: string; ssl: boolean; urlParams: string } {
  let username: string | undefined;
  let password: string | undefined;
  let ssl = false;
  const urlParams: string[] = [];

  for (const part of params.split(";")) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split("=");
    const key = decodeUrlPart(rawKey).trim().toLowerCase();
    const value = decodeUrlPart(rest.join("=")).trim();
    if (key === "user" || key === "username") {
      username = value;
    } else if (key === "password") {
      password = value;
    } else if (key === "ssl") {
      ssl = value.toLowerCase() === "true";
    } else {
      urlParams.push(part);
    }
  }

  return { username, password, ssl, urlParams: urlParams.join(";") };
}

function connectionNameParam(parsed: URL): string | undefined {
  for (const [key, value] of parsed.searchParams) {
    if (key.toLowerCase() === "name") {
      const name = value.trim();
      if (name) return name;
    }
  }
  return undefined;
}

function stripConnectionNameParam(params: string): string {
  if (!params) return params;
  return params
    .split("&")
    .filter((part) => {
      if (!part) return true;
      const [rawKey] = part.split("=");
      return decodeUrlPart(rawKey).trim().toLowerCase() !== "name";
    })
    .join("&");
}

function extractMysqlCredentialParams(params: string): { username?: string; password?: string; urlParams: string } {
  let username: string | undefined;
  let password: string | undefined;
  let foundCredentialParam = false;
  const urlParams: string[] = [];

  for (const part of params.split(/[&;]/)) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split("=");
    const key = decodeUrlPart(rawKey).trim().toLowerCase();
    if (key === "user") {
      username = decodeUrlPart(rest.join("=")).trim();
      foundCredentialParam = true;
    } else if (key === "password") {
      password = decodeUrlPart(rest.join("=")).trim();
      foundCredentialParam = true;
    } else {
      urlParams.push(part);
    }
  }

  return { username, password, urlParams: foundCredentialParam ? urlParams.join("&") : params };
}

function urlParamsRequireTls(dbType: DatabaseType, params: string): boolean {
  if (dbType === "dameng") {
    return damengSslFormConfig(params).enabled;
  }

  if (dbType === "mysql") {
    const requireSsl = queryParamLastValue(params, "require_ssl")?.toLowerCase();
    if (requireSsl === "true" || requireSsl === "1" || requireSsl === "yes") return true;
    const sslMode = (queryParamLastValue(params, "ssl-mode") || queryParamLastValue(params, "sslmode") || "").toLowerCase().replace("-", "_");
    if (sslMode === "required" || sslMode === "require" || sslMode === "verify_ca" || sslMode === "verify_identity") return true;
    if (requireSsl !== undefined || sslMode) return false;
    const jdbcUseSsl = (queryParamLastValue(params, "useSSL") || "").toLowerCase();
    const jdbcRequireSsl = (queryParamLastValue(params, "requireSSL") || "").toLowerCase();
    const jdbcVerifyServerCertificate = (queryParamLastValue(params, "verifyServerCertificate") || "").toLowerCase();
    if (["false", "0", "no", "off"].includes(jdbcUseSsl)) return false;
    return ["true", "1", "yes", "on"].includes(jdbcRequireSsl) || ["true", "1", "yes", "on"].includes(jdbcVerifyServerCertificate);
  }

  if (dbType === "postgres" || dbType === "redshift" || dbType === "kwdb") {
    const sslMode = (queryParamValue(params, "sslmode") || "").toLowerCase();
    return sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full";
  }

  return false;
}

function isTidbCloudHost(host: string): boolean {
  return host.toLowerCase().endsWith(".tidbcloud.com");
}

export function connectionProfileForScheme(scheme: string, preferredProfile?: string): ConnectionProfile | undefined {
  const normalizedScheme = scheme.trim().toLowerCase();
  const normalizedPreferredProfile = preferredProfile?.trim().toLowerCase();
  if ((normalizedScheme === "http" || normalizedScheme === "https") && normalizedPreferredProfile) {
    return HTTP_SELECTED_PROFILES[normalizedPreferredProfile];
  }
  if (normalizedScheme === "oceanbase" && normalizedPreferredProfile === "oceanbase-oracle") {
    return OCEANBASE_ORACLE_PROFILE;
  }
  // PostgreSQL-compatible products use standard PostgreSQL URLs, so keep the
  // selected product profile when parsing a pasted URL.
  if ((normalizedScheme === "postgres" || normalizedScheme === "postgresql") && (normalizedPreferredProfile === "cloudberry" || normalizedPreferredProfile === "opentenbase")) {
    return SCHEME_PROFILES[normalizedPreferredProfile];
  }
  return SCHEME_PROFILES[normalizedScheme];
}

function parseJdbcHiveUrl(source: string): ParsedConnectionUrl | null {
  const match = /^jdbc:hive2:\/\/(?<hosts>[^/?#;]+)(?:\/(?<path>[^?#]*))?(?<query>\?[^#]*)?(?<fragment>#.*)?$/i.exec(source);
  if (!match?.groups) return null;

  const firstHost = match.groups.hosts.split(",")[0]?.trim();
  if (!firstHost) return null;

  let endpoint: URL;
  try {
    endpoint = new URL(`hive2://${firstHost}`);
  } catch {
    return null;
  }
  if (!endpoint.hostname) return null;

  const [rawDatabase = "", ...paramParts] = (match.groups.path || "").split(";");
  const structured = extractHiveStructuredParams(paramParts.join(";"));
  const urlParams = `${structured.urlParams}${match.groups.query || ""}${match.groups.fragment || ""}`;

  return {
    dbType: "hive",
    driverProfile: "hive",
    driverLabel: "Apache Hive",
    host: endpoint.hostname.replace(/^\[(.*)]$/, "$1"),
    port: endpoint.port ? Number(endpoint.port) : 10000,
    username: structured.username ?? decodeUrlPart(endpoint.username),
    password: structured.password ?? decodeUrlPart(endpoint.password),
    database: decodeUrlPart(rawDatabase) || undefined,
    urlParams,
    ssl: structured.ssl,
    connectionString: source,
  };
}

function parseJdbcSqlServerUrl(source: string): ParsedConnectionUrl | null {
  const match = source.match(/^jdbc:sqlserver:\/\/([^;:/]+)(?::(\d+))?(?:;(.*))?$/i);
  if (!match) return null;

  const profile = SCHEME_PROFILES.sqlserver;
  const props = new Map<string, string>();
  const urlParams: string[] = [];
  for (const part of (match[3] || "").split(";")) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey.trim();
    const value = rest.join("=");
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "databasename" || normalizedKey === "database" || normalizedKey === "user") {
      props.set(normalizedKey, value);
    } else if (normalizedKey === "password") {
      props.set(normalizedKey, value);
    } else {
      urlParams.push(part);
    }
  }

  return {
    dbType: profile.type,
    driverProfile: profile.profile,
    driverLabel: profile.label,
    host: match[1],
    port: match[2] ? Number(match[2]) : profile.defaultPort,
    ...(match[2] ? { portExplicit: true } : {}),
    username: decodeUrlPart(props.get("user") || ""),
    password: decodeUrlPart(props.get("password") || ""),
    database: decodeUrlPart(props.get("databasename") || props.get("database") || "") || undefined,
    urlParams: urlParams.join(";"),
    ssl: false,
  };
}

function parseJdbcOracleUrl(source: string): ParsedConnectionUrl | null {
  const descriptorMatch = source.match(/^jdbc:oracle:thin:@\s*\((.+)\)\s*$/i);
  if (descriptorMatch) {
    const profile = SCHEME_PROFILES.oracle;
    const host = oracleDescriptorValue(source, "HOST");
    const port = oracleDescriptorValue(source, "PORT");
    const serviceName = oracleDescriptorValue(source, "SERVICE_NAME");
    const sid = oracleDescriptorValue(source, "SID");
    if (!host) return null;
    return {
      dbType: profile.type,
      driverProfile: profile.profile,
      driverLabel: profile.label,
      host,
      port: port ? Number(port) : profile.defaultPort,
      username: "",
      password: "",
      database: serviceName || sid || undefined,
      urlParams: "",
      ssl: false,
      connectionString: source,
      oracleConnectionType: sid && !serviceName ? "sid" : "service_name",
    };
  }

  const serviceMatch = source.match(/^jdbc:oracle:thin:@\/\/([^:/?#]+)(?::(\d+))?\/([^?]+)(?:\?(.*))?$/i);
  if (serviceMatch) {
    const profile = SCHEME_PROFILES.oracle;
    return {
      dbType: profile.type,
      driverProfile: profile.profile,
      driverLabel: profile.label,
      host: serviceMatch[1],
      port: serviceMatch[2] ? Number(serviceMatch[2]) : profile.defaultPort,
      username: "",
      password: "",
      database: decodeUrlPart(serviceMatch[3]),
      urlParams: serviceMatch[4] || "",
      ssl: false,
      oracleConnectionType: "service_name",
    };
  }

  const sidMatch = source.match(/^jdbc:oracle:thin:@([^:/?#]+)(?::(\d+))?:([^?]+)(?:\?(.*))?$/i);
  if (sidMatch) {
    const profile = SCHEME_PROFILES.oracle;
    return {
      dbType: profile.type,
      driverProfile: profile.profile,
      driverLabel: profile.label,
      host: sidMatch[1],
      port: sidMatch[2] ? Number(sidMatch[2]) : profile.defaultPort,
      username: "",
      password: "",
      database: decodeUrlPart(sidMatch[3]),
      urlParams: sidMatch[4] || "",
      ssl: false,
      oracleConnectionType: "sid",
    };
  }

  return null;
}

function oracleDescriptorValue(source: string, key: string): string | undefined {
  const match = new RegExp(`\\(${key}\\s*=\\s*([^\\)]+)\\)`, "i").exec(source);
  return match?.[1]?.trim();
}

function parseJdbcUCanAccessUrl(source: string): ParsedConnectionUrl | null {
  const match = source.match(/^jdbc:ucanaccess:\/\/(.+?)(?:;.*)?$/i);
  if (!match) return null;

  const filePath = decodeUrlPart(match[1]);
  const normalizedPath = filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath) ? filePath : `/${filePath}`;
  const database = normalizedPath.split(/[\\/]/).filter(Boolean).pop();

  return {
    dbType: "access",
    driverProfile: "access",
    driverLabel: "Microsoft Access",
    host: normalizedPath,
    port: 0,
    username: "",
    password: "",
    database,
    urlParams: "",
    ssl: false,
    connectionString: source,
  };
}

function parseJdbcGbase8sUrl(source: string): ParsedConnectionUrl | null {
  const match = /^jdbc:gbasedbt-sqli:\/\/(?:(?<userinfo>[^@/?#]*)@)?(?<host>\[[^\]]+\]|[^:/?#]+)(?::(?<port>\d+))?\/(?<database>[^:?#]*)(?::(?<params>[^?#]*))?/i.exec(source);
  if (!match?.groups) return null;

  const rawUserInfo = match.groups.userinfo || "";
  const [rawUser = "", ...passwordParts] = rawUserInfo.split(":");
  const host = match.groups.host.replace(/^\[/, "").replace(/\]$/, "");

  return {
    dbType: "gbase",
    driverProfile: "gbase8s",
    driverLabel: "南大通用 GBase 8s",
    host,
    port: match.groups.port ? Number(match.groups.port) : 9088,
    username: decodeUrlPart(rawUser),
    password: decodeUrlPart(passwordParts.join(":")),
    database: decodeUrlPart(match.groups.database || ""),
    urlParams: match.groups.params || "",
    ssl: false,
  };
}

function parseJdbcInformixUrl(source: string): ParsedConnectionUrl | null {
  const match = /^jdbc:informix-sqli:\/\/(?:(?<userinfo>[^@/?#]*)@)?(?<host>\[[^\]]+\]|[^:/?#]+)(?::(?<port>\d+))?\/(?<database>[^:?#]*)(?::(?<params>[^?#]*))?/i.exec(source);
  if (!match?.groups) return null;

  const rawUserInfo = match.groups.userinfo || "";
  const [rawUser = "", ...passwordParts] = rawUserInfo.split(":");
  const host = match.groups.host.replace(/^\[/, "").replace(/\]$/, "");

  return {
    dbType: "informix",
    driverProfile: "informix",
    driverLabel: "Informix",
    host,
    port: match.groups.port ? Number(match.groups.port) : 9088,
    username: decodeUrlPart(rawUser),
    password: decodeUrlPart(passwordParts.join(":")),
    database: decodeUrlPart(match.groups.database || ""),
    urlParams: match.groups.params || "",
    ssl: false,
  };
}

function parseJdbcDremioUrl(source: string): ParsedConnectionUrl | null {
  const match = /^jdbc:dremio:(?<mode>direct|zk)=(?<host>\[[^\]]+\]|[^:;]+)(?::(?<port>\d+))?(?:;(?<params>.*))?$/i.exec(source);
  if (!match?.groups) return null;

  const props = new Map<string, string>();
  const urlParams: string[] = [];
  for (const part of (match.groups.params || "").split(";")) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey.trim();
    const value = rest.join("=");
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "schema" || normalizedKey === "user" || normalizedKey === "password") {
      props.set(normalizedKey, value);
    } else {
      urlParams.push(part);
    }
  }

  return {
    dbType: "jdbc",
    driverProfile: "dremio",
    driverLabel: "Dremio",
    host: match.groups.host.replace(/^\[/, "").replace(/\]$/, ""),
    port: match.groups.port ? Number(match.groups.port) : match.groups.mode.toLowerCase() === "zk" ? 2181 : 31010,
    username: decodeUrlPart(props.get("user") || ""),
    password: decodeUrlPart(props.get("password") || ""),
    database: decodeUrlPart(props.get("schema") || "") || undefined,
    urlParams: urlParams.join(";"),
    ssl: false,
    connectionString: source,
  };
}

function parseJdbcDremioArrowFlightSqlUrl(source: string): ParsedConnectionUrl | null {
  if (!/^jdbc:arrow-flight-sql:\/\//i.test(source)) return null;

  let parsed: URL;
  try {
    parsed = new URL(source.replace(/^jdbc:/i, ""));
  } catch {
    return null;
  }

  const urlParams = parsed.search.replace(/^\?/, "");

  return {
    dbType: "jdbc",
    driverProfile: "dremio",
    driverLabel: "Dremio",
    host: parsed.hostname.replace(/^\[(.*)]$/, "$1"),
    port: parsed.port ? Number(parsed.port) : 32010,
    username: decodeUrlPart(parsed.username),
    password: decodeUrlPart(parsed.password),
    database: queryParamValue(urlParams, "schema") || undefined,
    urlParams,
    ssl: queryParamValue(urlParams, "useEncryption")?.toLowerCase() !== "false",
    connectionString: source,
  };
}

type MysqlCliOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  charset?: string;
  ssl?: boolean;
  dsn?: string;
};

const MYSQL_CLI_COMMAND_SCHEMES: Record<string, string> = {
  mysql: "mysql",
  mycli: "mysql",
  mariadb: "mariadb",
};

// Short flags that take a value. `-p` is handled separately: the mysql client
// only reads a password that is attached to the flag, and a bare `-p` means
// "prompt me" instead of consuming the next argument.
const MYSQL_CLI_VALUE_SHORT_FLAGS = new Set(["h", "P", "u", "D", "S", "e", "O", "R", "l", "d"]);

// Long options that take a value but carry no connection field we keep. They
// must still be listed so a detached value is not mistaken for the database.
const MYSQL_CLI_IGNORED_VALUE_LONG_OPTIONS = new Set([
  "socket",
  "execute",
  "protocol",
  "connect-timeout",
  "login-path",
  "defaults-file",
  "defaults-extra-file",
  "prompt",
  "pager",
  "bind-address",
  "plugin-dir",
  "default-auth",
  "init-command",
  "server-public-key-path",
  "character-sets-dir",
  "ssl-ca",
  "ssl-capath",
  "ssl-cert",
  "ssl-cipher",
  "ssl-key",
  "ssl-crl",
  "ssl-crlpath",
  "ssl-fips-mode",
  "tls-version",
  "tls-ciphersuites",
  "dsn",
  "myclirc",
  "logfile",
  "auth-plugin",
]);

const MYSQL_CLI_TLS_SSL_MODES = new Set(["required", "require", "verify_ca", "verify_identity"]);

function tokenizeShellCommand(input: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (quote === '"') {
      if (char === "\\" && index + 1 < input.length && ['"', "\\", "$", "`"].includes(input[index + 1])) {
        current += input[index + 1];
        index += 1;
      } else if (char === '"') {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (char === "\\" && index + 1 < input.length) {
      // Keep a backslash that escapes nothing so Windows paths survive.
      const next = input[index + 1];
      if (/[\s'"\\$`]/.test(next)) {
        current += next;
        index += 1;
      } else {
        current += char;
      }
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }

  if (quote) return null;
  if (started) tokens.push(current);
  return tokens;
}

function mysqlCliCommand(token: string): { command: string; scheme: string } | null {
  if (token.includes("://")) return null;
  const basename = token.split(/[/\\]/).pop() || "";
  const command = basename.replace(/\.(exe|cmd|bat)$/i, "").toLowerCase();
  const scheme = MYSQL_CLI_COMMAND_SCHEMES[command];
  return scheme ? { command, scheme } : null;
}

function mysqlCliPort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port in connection command: ${value}`);
  }
  return port;
}

function mysqlCliSslMode(value: string): boolean {
  return MYSQL_CLI_TLS_SSL_MODES.has(value.trim().toLowerCase().replace(/-/g, "_"));
}

function mergeMysqlCliUrlParams(baseParams: string, charset: string | undefined): string {
  if (!charset) return baseParams;
  const kept = baseParams
    .split("&")
    .filter((part) => part && decodeUrlPart(part.split("=")[0]).trim().toLowerCase() !== "charset")
    .join("&");
  return [kept, `charset=${charset}`].filter(Boolean).join("&");
}

/**
 * Parses a mysql-family command line (`mysql`, `mycli`, `mariadb`) so users can
 * paste what they already have in a terminal — including the `mycli -h… -P… -u… -p…`
 * line DBX itself puts on the clipboard from "copy connection details".
 */
function parseMysqlCliCommand(value: string, preferredProfile?: string): ParsedConnectionUrl | null {
  const tokens = tokenizeShellCommand(value.replace(/^[$#>]\s+/, ""));
  if (!tokens?.length) return null;
  const cliCommand = mysqlCliCommand(tokens[0]);
  if (!cliCommand) return null;
  // mycli uses click, where `-p secret` is valid; the mysql client is not.
  const allowDetachedPassword = cliCommand.command === "mycli";

  const options: MysqlCliOptions = {};
  const positionals: string[] = [];
  let sawKnownOption = false;
  let index = 1;

  const detachedValue = (): string | undefined => {
    const next = tokens[index + 1];
    if (next === undefined || next.startsWith("-")) return undefined;
    index += 1;
    return next;
  };

  for (; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === "--") continue;

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const separator = body.indexOf("=");
      const name = (separator >= 0 ? body.slice(0, separator) : body).toLowerCase();
      const attached = separator >= 0 ? body.slice(separator + 1) : undefined;
      const optionValue = () => attached ?? detachedValue();

      if (name === "host") {
        const host = optionValue();
        if (host) {
          options.host = host;
          sawKnownOption = true;
        }
      } else if (name === "port") {
        const port = optionValue();
        if (port) {
          options.port = mysqlCliPort(port);
          sawKnownOption = true;
        }
      } else if (name === "user" || name === "username") {
        const username = optionValue();
        if (username !== undefined) {
          options.username = username;
          sawKnownOption = true;
        }
      } else if (name === "password") {
        // A bare `--password` prompts for the password, so keep it empty.
        options.password = attached ?? (allowDetachedPassword ? detachedValue() ?? "" : "");
        sawKnownOption = true;
      } else if (name === "database" || name === "dbname") {
        const database = optionValue();
        if (database) {
          options.database = database;
          sawKnownOption = true;
        }
      } else if (name === "default-character-set" || name === "charset") {
        const charset = optionValue();
        if (charset) {
          options.charset = charset;
          sawKnownOption = true;
        }
      } else if (name === "ssl-mode") {
        const sslMode = optionValue();
        if (sslMode) {
          options.ssl = mysqlCliSslMode(sslMode);
          sawKnownOption = true;
        }
      } else if (name === "ssl") {
        options.ssl = true;
        sawKnownOption = true;
      } else if (name === "skip-ssl" || name === "disable-ssl") {
        options.ssl = false;
        sawKnownOption = true;
      } else if (MYSQL_CLI_IGNORED_VALUE_LONG_OPTIONS.has(name)) {
        if (attached === undefined) detachedValue();
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      // Boolean short flags may be bundled (`-tA`), so walk until a flag that
      // takes a value consumes the rest of the token.
      for (let cursor = 1; cursor < token.length; cursor += 1) {
        const flag = token[cursor];
        const attached = token.slice(cursor + 1);
        if (flag === "p") {
          options.password = attached || (allowDetachedPassword ? detachedValue() ?? "" : "");
          sawKnownOption = true;
          break;
        }
        if (!MYSQL_CLI_VALUE_SHORT_FLAGS.has(flag)) continue;
        const flagValue = attached || detachedValue();
        if (flagValue === undefined) break;
        if (flag === "h") {
          options.host = flagValue;
          sawKnownOption = true;
        } else if (flag === "P") {
          options.port = mysqlCliPort(flagValue);
          sawKnownOption = true;
        } else if (flag === "u") {
          options.username = flagValue;
          sawKnownOption = true;
        } else if (flag === "D") {
          options.database = flagValue;
          sawKnownOption = true;
        }
        break;
      }
      continue;
    }

    positionals.push(token);
  }

  const firstPositional = positionals[0];
  if (firstPositional?.includes("://") || /^jdbc:/i.test(firstPositional || "")) {
    options.dsn = firstPositional;
  } else if (firstPositional && !options.database) {
    options.database = firstPositional;
  }

  if (!sawKnownOption && !options.dsn && !options.database) return null;

  const base = options.dsn ? parseConnectionUrl(options.dsn, preferredProfile) : undefined;
  const profile = connectionProfileForScheme(cliCommand.scheme, preferredProfile) ?? SCHEME_PROFILES[cliCommand.scheme];
  const urlParams = mergeMysqlCliUrlParams(base?.urlParams ?? "", options.charset);
  const dbType = base?.dbType ?? profile.type;
  const host = options.host ?? base?.host ?? "localhost";
  const ssl = options.ssl ?? ((base?.ssl ?? false) || urlParamsRequireTls(dbType, urlParams) || (dbType === "mysql" && isTidbCloudHost(host)));

  return {
    ...(base ?? {}),
    dbType,
    driverProfile: base?.driverProfile ?? profile.profile,
    driverLabel: base?.driverLabel ?? profile.label,
    host,
    port: options.port ?? base?.port ?? profile.defaultPort,
    username: options.username ?? base?.username ?? "",
    password: options.password ?? base?.password ?? "",
    database: options.database ?? base?.database,
    urlParams,
    ssl,
  };
}

export function parseConnectionUrl(value: string, preferredProfile?: string): ParsedConnectionUrl {
  const input = value.trim();
  if (!input) {
    throw new Error("Connection URL is empty");
  }
  const mysqlCli = parseMysqlCliCommand(input, preferredProfile);
  if (mysqlCli) return mysqlCli;
  if (/^jdbc:oceanbase:(?:oracle:)?loadbalance:\/\//i.test(input)) {
    throw new Error("Unsupported OceanBase JDBC URL variant: loadbalance");
  }
  const jdbcHive = parseJdbcHiveUrl(input);
  if (jdbcHive) return jdbcHive;
  const jdbcH2 = parseH2JdbcUrl(input);
  if (jdbcH2) return jdbcH2;
  const jdbcUCanAccess = parseJdbcUCanAccessUrl(input);
  if (jdbcUCanAccess) return jdbcUCanAccess;
  const jdbcGbase8s = parseJdbcGbase8sUrl(input);
  if (jdbcGbase8s) return jdbcGbase8s;
  const jdbcInformix = parseJdbcInformixUrl(input);
  if (jdbcInformix) return jdbcInformix;
  const jdbcDremioArrowFlightSql = parseJdbcDremioArrowFlightSqlUrl(input);
  if (jdbcDremioArrowFlightSql) return jdbcDremioArrowFlightSql;
  const jdbcDremio = parseJdbcDremioUrl(input);
  if (jdbcDremio) return jdbcDremio;
  const jdbcOracle = parseJdbcOracleUrl(input);
  if (jdbcOracle) return jdbcOracle;
  const jdbcSqlServer = parseJdbcSqlServerUrl(input);
  if (jdbcSqlServer) return jdbcSqlServer;
  const isJdbcUrl = /^jdbc:/i.test(input);
  const isOceanBaseOracleJdbc = /^jdbc:oceanbase:oracle:\/\//i.test(input);
  const source = isOceanBaseOracleJdbc ? input.replace(/^jdbc:oceanbase:oracle:/i, "oceanbase:") : isJdbcUrl ? input.replace(/^jdbc:/i, "") : input;

  const mongoResult = parseMongoUrl(source);
  if (mongoResult) return mongoResult;

  const zooKeeperResult = parseZooKeeperUrl(source);
  if (zooKeeperResult) return zooKeeperResult;

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error("Invalid connection URL");
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  const profile = connectionProfileForScheme(scheme, isOceanBaseOracleJdbc ? "oceanbase-oracle" : preferredProfile);
  if (!profile) {
    throw new Error(`Unsupported connection URL scheme: ${scheme}`);
  }

  const urlParams = parsed.search.replace(/^\?/, "");
  const name = connectionNameParam(parsed);
  const urlParamsWithoutName = stripConnectionNameParam(urlParams);
  const normalizedFragment = decodeUrlPart(parsed.hash.replace(/^#/, "")).trim().toLowerCase();
  const parsedUrlParams = profile.type === "redis" && normalizedFragment === "insecure" ? [urlParamsWithoutName, "insecure=true"].filter(Boolean).join("&") : urlParamsWithoutName;
  const jdbcCredentials = isJdbcUrl && (profile.type === "mysql" || profile.profile === "oceanbase-oracle") ? extractMysqlCredentialParams(parsedUrlParams) : undefined;
  const effectiveUrlParams = jdbcCredentials?.urlParams ?? parsedUrlParams;
  if (profile.type === "mongodb") {
    return {
      dbType: profile.type,
      driverProfile: profile.profile,
      driverLabel: profile.label,
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : profile.defaultPort,
      username: decodeUrlPart(parsed.username),
      password: decodeUrlPart(parsed.password),
      database: databaseFromPath(parsed.pathname),
      urlParams: parsedUrlParams,
      ssl: scheme === "mongodb+srv",
      connectionString: normalizeMongoConnectionString(source),
      useMongoUrl: true,
    };
  }
  if (profile.type === "zookeeper") {
    return {
      ...(name ? { name } : {}),
      dbType: profile.type,
      driverProfile: profile.profile,
      driverLabel: profile.label,
      host: parsed.hostname.replace(/^\[(.*)]$/, "$1"),
      port: parsed.port ? Number(parsed.port) : profile.defaultPort,
      username: decodeUrlPart(parsed.username),
      password: decodeUrlPart(parsed.password),
      database: undefined,
      urlParams: urlParamsWithoutName,
      ssl: false,
      connectionString: zookeeperConnectStringFromUrl(parsed, profile.defaultPort),
    };
  }

  const isMeilisearch = profile.type === "meilisearch";
  const defaultPort = isJdbcUrl && scheme === "oceanbase" ? 3306 : isMeilisearch && scheme === "http" ? 80 : isMeilisearch && scheme === "https" ? 443 : profile.defaultPort;

  return {
    ...(name ? { name } : {}),
    dbType: profile.type,
    driverProfile: profile.profile,
    driverLabel: profile.label,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : defaultPort,
    ...(profile.type === "sqlserver" && parsed.port ? { portExplicit: true } : {}),
    username: jdbcCredentials?.username ?? decodeUrlPart(parsed.username),
    password: jdbcCredentials?.password ?? decodeUrlPart(parsed.password),
    database: profile.type === "victoriametrics" ? "metrics" : profile.type === "dynamodb" ? dynamodbRegionFromHost(parsed.hostname) : isMeilisearch ? undefined : databaseFromPath(parsed.pathname),
    urlParams: effectiveUrlParams,
    ssl: scheme === "rediss" || scheme === "https" || urlParamsRequireTls(profile.type, effectiveUrlParams) || (profile.type === "mysql" && isTidbCloudHost(parsed.hostname)),
    ...(profile.type === "victoriametrics" ? { apiPath: parsed.pathname.replace(/\/+$/, "") } : {}),
    ...(isMeilisearch ? { basePath: parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "") } : {}),
  };
}

function zookeeperConnectStringFromUrl(parsed: URL, defaultPort: number): string {
  const rawHost = parsed.hostname.replace(/^\[(.*)]$/, "$1");
  const host = rawHost.includes(":") ? `[${rawHost}]` : rawHost;
  const port = parsed.port ? Number(parsed.port) : defaultPort;
  const chroot = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  return `${host}:${port}${chroot}`;
}

function shouldPreserveCredentialFreeUrlCredentials(config: Omit<ConnectionConfig, "id">, parsed: ParsedConnectionUrl): boolean {
  const currentProfile = config.driver_profile?.trim();
  return parsed.dbType === config.db_type && (!currentProfile || parsed.driverProfile === currentProfile) && !parsed.username && !parsed.password;
}

function applyParsedUsername(config: Omit<ConnectionConfig, "id">, parsed: ParsedConnectionUrl): string {
  if (parsed.dbType === "h2" && config.db_type === "h2" && !h2JdbcUrlHasUserParam(parsed.connectionString)) {
    return config.username || parsed.username;
  }
  if (parsed.dbType === "kingbase" && config.db_type === "kingbase" && !parsed.username) {
    return config.username;
  }
  if (shouldPreserveCredentialFreeUrlCredentials(config, parsed)) {
    return config.username || parsed.username;
  }
  return parsed.username;
}

function applyParsedPassword(config: Omit<ConnectionConfig, "id">, parsed: ParsedConnectionUrl): string {
  if (parsed.dbType === "h2" && config.db_type === "h2" && !h2JdbcUrlHasPasswordParam(parsed.connectionString)) {
    return config.password || parsed.password;
  }
  if (parsed.dbType === "kingbase" && config.db_type === "kingbase" && !parsed.password) {
    return config.password;
  }
  if (shouldPreserveCredentialFreeUrlCredentials(config, parsed)) {
    return config.password || parsed.password;
  }
  return parsed.password;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function applyMeilisearchBasePathToExternalConfig(existing: unknown, basePath: string | undefined): unknown {
  const next = isRecord(existing) ? { ...existing } : {};
  delete next.base_path;
  if (basePath) {
    next.basePath = basePath;
  } else {
    delete next.basePath;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function parsedExternalConfig(existing: unknown, parsed: ParsedConnectionUrl): unknown {
  if (parsed.dbType === "victoriametrics") {
    const next = isRecord(existing) ? { ...existing } : {};
    next.apiPath = parsed.apiPath || "/prometheus";
    return next;
  }
  if (parsed.dbType === "meilisearch") {
    return applyMeilisearchBasePathToExternalConfig(existing, parsed.basePath);
  }
  if (parsed.dbType !== "sqlserver") return existing;

  const next = isRecord(existing) ? { ...existing } : {};
  delete next.port_explicit;
  if (parsed.portExplicit) {
    next.portExplicit = true;
  } else {
    delete next.portExplicit;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function applyParsedConnectionUrl(config: Omit<ConnectionConfig, "id">, parsed: ParsedConnectionUrl): Omit<ConnectionConfig, "id"> {
  return {
    ...config,
    db_type: parsed.dbType,
    driver_profile: parsed.driverProfile,
    driver_label: parsed.driverLabel,
    host: parsed.host,
    port: parsed.port,
    name: parsed.name?.trim() || config.name,
    username: applyParsedUsername(config, parsed),
    password: applyParsedPassword(config, parsed),
    database: parsed.dbType === "dynamodb" ? parsed.database || config.database || "us-east-1" : parsed.database,
    url_params: parsed.urlParams,
    ssl: parsed.ssl,
    connection_string: parsed.connectionString,
    oracle_connection_type: parsed.oracleConnectionType,
    external_config: parsedExternalConfig(config.external_config, parsed),
  };
}
