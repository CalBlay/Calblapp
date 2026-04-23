import axios from "axios";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPowerBiError(err) {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err : new Error(String(err));
  }
  const d = err.response?.data;
  const msg =
    d?.error?.message ||
    d?.error_description ||
    d?.error?.pbi?.message ||
    d?.Message ||
    d?.message ||
    err.message;
  const code = d?.error?.code || d?.error || err.response?.status || "request_failed";
  return new Error(`Power BI API (${code}): ${msg}`);
}

function getWorkspaceConfig() {
  const groupId = process.env.POWERBI_GROUP_ID?.trim();
  const datasetId = process.env.POWERBI_DATASET_ID?.trim();
  if (!groupId || !datasetId) {
    throw new Error("Missing POWERBI_GROUP_ID / POWERBI_DATASET_ID");
  }
  return { groupId, datasetId };
}

async function getAccessToken() {
  const tenantId = process.env.POWERBI_TENANT_ID?.trim();
  const clientId = process.env.POWERBI_CLIENT_ID?.trim();
  const clientSecret = process.env.POWERBI_CLIENT_SECRET?.trim();

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing POWERBI_TENANT_ID / POWERBI_CLIENT_ID / POWERBI_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://analysis.windows.net/powerbi/api/.default"
  });

  try {
    const response = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 30_000 }
    );
    if (!response.data?.access_token) {
      throw new Error("Resposta de token sense access_token");
    }
    return response.data.access_token;
  } catch (e) {
    throw formatPowerBiError(e);
  }
}

/**
 * Últims refrescos del dataset (històric PBI).
 * @param {number} [top=10]
 */
export async function getPowerBiDatasetRefreshHistory(top = 10) {
  const { groupId, datasetId } = getWorkspaceConfig();
  const token = await getAccessToken();
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/datasets/${datasetId}/refreshes`;
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { $top: Math.min(50, Math.max(1, top)) },
      timeout: 45_000
    });
    const value = Array.isArray(data?.value) ? data.value : [];
    return {
      ok: true,
      groupId,
      datasetId,
      at: new Date().toISOString(),
      count: value.length,
      refreshes: value.map((r) => ({
        id: r.id,
        refreshType: r.refreshType,
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status,
        serviceExceptionJson: r.serviceExceptionJson || null
      }))
    };
  } catch (e) {
    throw formatPowerBiError(e);
  }
}

/**
 * Sol·licita un refresc del dataset (API Power BI).
 * Opcionalment fa polling fins que l’últim refresc passi a Completed / Failed (veure env).
 *
 * @param {{ poll?: boolean }} [options] — poll=true força espera encara que POWERBI_REFRESH_POLL_MS sigui 0
 */
export async function refreshPowerBiDataset(options = {}) {
  const { groupId, datasetId } = getWorkspaceConfig();
  const token = await getAccessToken();

  const notifyRaw = (process.env.POWERBI_REFRESH_NOTIFY || "MailOnFailure").trim();
  const notifyOption = ["NoNotification", "MailOnFailure"].includes(notifyRaw)
    ? notifyRaw
    : "MailOnFailure";

  const url = `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/datasets/${datasetId}/refreshes`;

  try {
    await axios.post(url, { notifyOption }, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 60_000,
      validateStatus: (s) => s === 202 || s === 200
    });
  } catch (e) {
    throw formatPowerBiError(e);
  }

  const pollMs = Number(process.env.POWERBI_REFRESH_POLL_MS || 0);
  const maxAttempts = Number(process.env.POWERBI_REFRESH_POLL_ATTEMPTS || 10);
  const forcePoll = options.poll === true;

  let refreshes = null;
  if ((pollMs > 0 && maxAttempts > 0) || forcePoll) {
    const interval = Math.max(500, pollMs || 2500);
    const attempts = forcePoll ? Math.max(maxAttempts, 12) : maxAttempts;
    for (let i = 0; i < attempts; i += 1) {
      await sleep(interval);
      const hist = await getPowerBiDatasetRefreshHistory(5);
      refreshes = hist.refreshes;
      const latest = refreshes[0];
      if (latest && (latest.status === "Completed" || latest.status === "Failed")) {
        break;
      }
    }
  }

  if (!refreshes) {
    const hist = await getPowerBiDatasetRefreshHistory(5);
    refreshes = hist.refreshes;
  }

  const latest = refreshes[0] || null;
  return {
    ok: true,
    datasetId,
    groupId,
    notifyOption,
    requestedAt: new Date().toISOString(),
    latestRefresh: latest,
    recentRefreshes: refreshes,
    note:
      "Refresc enviat a Power BI. Estat Unknown o sense endTime normalment indica procés en curs. " +
      "Pots consultar GET /jobs/powerbi/refresh-status sense tornar a disparar el refresc."
  };
}
