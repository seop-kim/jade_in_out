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
  return new Map(Object.entries(parsed));
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
