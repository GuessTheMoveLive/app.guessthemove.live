export default {
  async fetch() {
    return new Response(
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>Guess the Move</title></head><body style=\"margin:0;background:#fff;\"></body></html>",
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  },
};
