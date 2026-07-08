export async function fetchWithRetry(url, options, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
        if (attempt === maxRetries - 1) return response;
        const delay = Math.min(8000, Math.pow(2, attempt) * baseDelay) + (Math.random() * 300);
        console.warn(`HTTP ${response.status}. Backing off ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const delay = Math.pow(2, attempt) * baseDelay + (Math.random() * 300);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
