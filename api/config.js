function requiredEnv(name) {
  const value = process.env[name] && process.env[name].trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function routesFromEnv() {
  const value = requiredEnv('INSA_ALLOWED_ROUTES_JSON');
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('INSA_ALLOWED_ROUTES_JSON must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INSA_ALLOWED_ROUTES_JSON must be an object');
  }
  const routes = new Map(Object.entries(parsed));
  // Historical leave-period details are linked from the authenticated leave page.
  // Keep this fixed read-only endpoint available even for older deployments whose
  // route environment variable predates the new-hire period feature.
  if (!routes.has('/leave/pop_leave.asp')) routes.set('/leave/pop_leave.asp', 'GET');
  return routes;
}

const serverConfig = Object.freeze({
  jade: Object.freeze({
    host: requiredEnv('JADE_TARGET_HOST'),
    origin: requiredEnv('JADE_TARGET_ORIGIN'),
  }),
  insa: Object.freeze({
    host: requiredEnv('INSA_TARGET_HOST'),
    origin: requiredEnv('INSA_TARGET_ORIGIN'),
    routes: routesFromEnv(),
  }),
});

module.exports = {serverConfig};
