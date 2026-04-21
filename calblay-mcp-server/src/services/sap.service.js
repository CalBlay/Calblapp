import axios from "axios";

function getSapConfig() {
  const baseUrl = process.env.SAP_URL;
  const companyDb = process.env.SAP_COMPANY_DB;
  const userName = process.env.SAP_USER;
  const password = process.env.SAP_PASSWORD;

  if (!baseUrl || !companyDb || !userName || !password) {
    throw new Error("Missing SAP_URL / SAP_COMPANY_DB / SAP_USER / SAP_PASSWORD");
  }

  return { baseUrl, companyDb, userName, password };
}

function extractCookie(setCookieHeader) {
  if (!Array.isArray(setCookieHeader)) return "";
  return setCookieHeader.map((c) => c.split(";")[0]).join("; ");
}

export async function loginSap() {
  const cfg = getSapConfig();
  const loginUrl = `${cfg.baseUrl.replace(/\/$/, "")}/Login`;

  const response = await axios.post(loginUrl, {
    CompanyDB: cfg.companyDb,
    UserName: cfg.userName,
    Password: cfg.password
  });

  return {
    sessionId: response.data?.SessionId,
    routeId: response.data?.RouteId,
    cookie: extractCookie(response.headers["set-cookie"])
  };
}

async function sapGet(path, cookie) {
  const cfg = getSapConfig();
  const url = `${cfg.baseUrl.replace(/\/$/, "")}${path}`;
  const response = await axios.get(url, {
    headers: { Cookie: cookie }
  });
  return response.data?.value || response.data;
}

export async function getPurchases() {
  const session = await loginSap();
  return sapGet("/PurchaseInvoices?$top=100", session.cookie);
}

export async function getSales() {
  const session = await loginSap();
  return sapGet("/Invoices?$top=100", session.cookie);
}
