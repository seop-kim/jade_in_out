const {serverConfig} = require('../../api/config');

test('loads upstream hosts and allowed INSA routes from environment variables', () => {
  expect(serverConfig.jade.origin).toBe(process.env.JADE_TARGET_ORIGIN);
  expect(serverConfig.insa.origin).toBe(process.env.INSA_TARGET_ORIGIN);
  expect(serverConfig.insa.routes.get('/main.asp')).toBe('GET');
  expect(serverConfig.insa.routes.get('/worktime/01_list.asp')).toBe('POST');
});
