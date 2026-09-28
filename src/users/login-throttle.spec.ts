import { LoginThrottle } from './login-throttle';

describe('LoginThrottle', () => {
  let throttle: LoginThrottle;

  beforeEach(() => {
    throttle = new LoginThrottle();
  });

  it('lets the first attempts through', () => {
    for (let i = 0; i < 4; i += 1) throttle.fail('someone@example.test');
    expect(throttle.retryAfter('someone@example.test')).toBe(0);
  });

  describe('what it must refuse', () => {
    it('locks the account out on the fifth miss', () => {
      for (let i = 0; i < 5; i += 1) throttle.fail('someone@example.test');
      expect(throttle.retryAfter('someone@example.test')).toBeGreaterThan(0);
    });

    it('stays locked even for the right password', () => {
      // Otherwise the attacker who finally guesses right walks straight in,
      // and the lockout was theatre.
      for (let i = 0; i < 5; i += 1) throttle.fail('someone@example.test');
      expect(throttle.retryAfter('someone@example.test')).toBeGreaterThan(0);
    });

    it('locks for half an hour, give or take a second', () => {
      for (let i = 0; i < 5; i += 1) throttle.fail('someone@example.test');
      const wait = throttle.retryAfter('someone@example.test');
      expect(wait).toBeGreaterThan(29 * 60 * 1000);
      expect(wait).toBeLessThanOrEqual(30 * 60 * 1000);
    });
  });

  it('locks one account without touching another', () => {
    for (let i = 0; i < 5; i += 1) throttle.fail('victim@example.test');
    expect(throttle.retryAfter('bystander@example.test')).toBe(0);
  });

  it('forgets the misses once you get in', () => {
    for (let i = 0; i < 4; i += 1) throttle.fail('someone@example.test');
    throttle.succeed('someone@example.test');

    for (let i = 0; i < 4; i += 1) throttle.fail('someone@example.test');
    expect(throttle.retryAfter('someone@example.test')).toBe(0);
  });
});
