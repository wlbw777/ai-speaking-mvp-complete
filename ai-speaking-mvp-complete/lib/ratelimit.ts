const requests = new Map();

export function rateLimit(ip: string, limit = 10) {
  const now = Date.now();

  const record = requests.get(ip);

  if (!record) {
    requests.set(ip, {
      count: 1,
      reset: now + 60000
    });

    return true;
  }

  if (now > record.reset) {
    requests.set(ip, {
      count: 1,
      reset: now + 60000
    });

    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}