import axios from "axios";

async function getAccessToken() {
  const tenantId = process.env.POWERBI_TENANT_ID;
  const clientId = process.env.POWERBI_CLIENT_ID;
  const clientSecret = process.env.POWERBI_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing POWERBI_TENANT_ID / POWERBI_CLIENT_ID / POWERBI_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://analysis.windows.net/powerbi/api/.default"
  });

  const response = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    body.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return response.data.access_token;
}

export async function refreshPowerBiDataset() {
  const groupId = process.env.POWERBI_GROUP_ID;
  const datasetId = process.env.POWERBI_DATASET_ID;
  if (!groupId || !datasetId) {
    throw new Error("Missing POWERBI_GROUP_ID / POWERBI_DATASET_ID");
  }

  const token = await getAccessToken();
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/datasets/${datasetId}/refreshes`;

  await axios.post(
    url,
    { notifyOption: "NoNotification" },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return { ok: true, datasetId, groupId, at: new Date().toISOString() };
}
