const test = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('../src/services/emailService');

test('production SMTP config forces 465 SSL and strips spaces from app password', () => {
  const { resolveSmtpConfig, buildSmtpTransportOptions } = emailService;

  assert.ok(resolveSmtpConfig, 'resolveSmtpConfig should be exported');
  assert.ok(buildSmtpTransportOptions, 'buildSmtpTransportOptions should be exported');

  const config = resolveSmtpConfig(
    {
      host: 'smtp.gmail.com',
      email: 'user@gmail.com',
      pass: ' 12 34 56 78 90 12 34 ',
    },
    { RENDER: 'true', NODE_ENV: 'production' },
  );

  assert.equal(config.host, 'smtp.gmail.com');
  assert.equal(config.user, 'user@gmail.com');
  assert.equal(config.pass, '12345678901234');

  const options = buildSmtpTransportOptions(config, {
    RENDER: 'true',
    NODE_ENV: 'production',
  });

  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.equal(options.auth.pass, '12345678901234');
});
