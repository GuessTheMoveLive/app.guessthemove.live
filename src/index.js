export default {
  async fetch(request, env) {
    const environment = env.ENVIRONMENT || "unknown";
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Guess the Move — ${environment}</title></head><body style="margin:0;background:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><h1>Guess the Move (${environment})</h1></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  },
};
